'use client';

import { useState, useEffect, useMemo } from 'react';
import TaskForm from './components/TaskForm';
import InvoiceForm from './components/InvoiceForm';
import EndCycleModal from './components/EndCycleModal';
import { Task, Priority, Status, Category, Attachment, Invoice, InvoiceStatus, Cycle, CycleEntry } from './types';
import { supabase } from '../lib/supabase';
import { downloadInvoicePDF } from '../lib/invoicePDF';

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};

const STATUS_STYLES: Record<Status, string> = {
  'todo': 'bg-gray-100 text-gray-600',
  'in-progress': 'bg-blue-100 text-blue-700',
  'ready-to-test': 'bg-amber-100 text-amber-700',
  'done': 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS: Record<Status, string> = {
  'todo': 'To Do',
  'in-progress': 'In Progress',
  'ready-to-test': 'Ready to Test',
  'done': 'Done',
};

const CATEGORY_STYLES: Record<Category, string> = {
  'bug': 'bg-rose-100 text-rose-700',
  'new-feature': 'bg-violet-100 text-violet-700',
  'improvement': 'bg-cyan-100 text-cyan-700',
  'va': 'bg-orange-100 text-orange-700',
};

const CATEGORY_LABELS: Record<Category, string> = {
  'bug': 'Bug',
  'new-feature': 'New Feature',
  'improvement': 'Improvement',
  'va': 'VA',
};

const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
};

const LOCAL_CYCLES_KEY = 'dev-manager-cycles';

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function invoiceTotal(invoice: Invoice) {
  return invoice.items.reduce((sum, item) => sum + item.amount, 0);
}

function isOverdue(dueDate?: string, status?: Status) {
  if (!dueDate || status === 'done') return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function sortCyclesByDate(cycles: Cycle[]) {
  return [...cycles].sort(
    (a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime()
  );
}

function readLocalCycles(): Cycle[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(LOCAL_CYCLES_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Cycle[];
    if (!Array.isArray(parsed)) return [];
    return sortCyclesByDate(
      parsed.filter(
        (cycle) =>
          cycle &&
          typeof cycle.id === 'string' &&
          typeof cycle.label === 'string' &&
          typeof cycle.endedAt === 'string' &&
          typeof cycle.totalMinutes === 'number' &&
          Array.isArray(cycle.snapshot)
      )
    );
  } catch {
    return [];
  }
}

function writeLocalCycles(cycles: Cycle[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_CYCLES_KEY, JSON.stringify(sortCyclesByDate(cycles)));
}

function mergeCycles(primary: Cycle[], secondary: Cycle[]) {
  const merged = new Map<string, Cycle>();

  for (const cycle of [...primary, ...secondary]) {
    merged.set(cycle.id, cycle);
  }

  return sortCyclesByDate(Array.from(merged.values()));
}

function formatSupabaseError(error: { code?: string; message?: string } | null, tableName: string) {
  if (!error) return `Could not save the ${tableName}.`;
  if (error.code === '42P01' || error.message?.includes(`relation "${tableName}" does not exist`)) {
    return `The "${tableName}" table does not exist in Supabase. The cycle will be stored locally in this browser.`;
  }
  return error.message ?? `Could not save the ${tableName}.`;
}

export default function Home() {
  const [view, setView] = useState<'tasks' | 'ready-to-test' | 'invoices'>('tasks');

  // --- Tasks state ---
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedAttachments, setExpandedAttachments] = useState<Set<string>>(new Set());

  // --- Invoices state ---
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [defaultRate, setDefaultRate] = useState('');
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');

  // --- Cycles state ---
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [showEndCycleModal, setShowEndCycleModal] = useState(false);
  const [expandedCycles, setExpandedCycles] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem('dev-manager-hourly-rate');
    if (saved) { setDefaultRate(saved); setRateInput(saved); }
  }, []);

  function saveRate() {
    const val = rateInput.trim();
    setDefaultRate(val);
    if (val) localStorage.setItem('dev-manager-hourly-rate', val);
    else localStorage.removeItem('dev-manager-hourly-rate');
    setEditingRate(false);
  }

  useEffect(() => {
    async function fetchCycles() {
      const localCycles = readLocalCycles();
      if (localCycles.length > 0) {
        setCycles(localCycles);
      }

      const { data, error } = await supabase
        .from('cycles')
        .select('*')
        .order('ended_at', { ascending: false });

      if (!error && data) {
        const remoteCycles = data.map((row: Record<string, unknown>) => ({
          id: row.id as string,
          label: row.label as string,
          endedAt: row.ended_at as string,
          totalMinutes: row.total_minutes as number,
          snapshot: (row.snapshot as CycleEntry[]) ?? [],
        }));
        const merged = mergeCycles(remoteCycles, localCycles);
        setCycles(merged);
        writeLocalCycles(merged);
      }
    }
    fetchCycles();
  }, []);

  async function endCycle(label: string) {
    const tasksWithTime = tasks.filter((t) => t.timeSpent && t.timeSpent > 0);
    if (tasksWithTime.length === 0) {
      throw new Error('There are no tasks with time logged.');
    }

    const totalMinutes = tasksWithTime.reduce((sum, t) => sum + (t.timeSpent ?? 0), 0);
    const snapshot: CycleEntry[] = tasksWithTime.map((t) => ({
      taskId: t.id,
      taskName: t.name,
      timeSpent: t.timeSpent!,
      category: t.category,
      status: t.status,
    }));

    let cycleToStore: Cycle = {
      id: crypto.randomUUID(),
      label,
      endedAt: new Date().toISOString(),
      totalMinutes,
      snapshot,
    };

    let insertedRemoteCycleId: string | null = null;
    const { data: row, error } = await supabase
      .from('cycles')
      .insert({ label, total_minutes: totalMinutes, snapshot })
      .select()
      .single();

    if (!error && row) {
      insertedRemoteCycleId = row.id as string;
      cycleToStore = {
        id: row.id as string,
        label: row.label as string,
        endedAt: row.ended_at as string,
        totalMinutes: row.total_minutes as number,
        snapshot: (row.snapshot as CycleEntry[]) ?? snapshot,
      };
    }

    const ids = tasksWithTime.map((t) => t.id);
    const { error: resetError } = await supabase
      .from('tasks')
      .update({ time_spent: 0 })
      .in('id', ids);

    if (resetError) {
      if (insertedRemoteCycleId) {
        await supabase.from('cycles').delete().eq('id', insertedRemoteCycleId);
      }
      throw new Error(resetError.message ?? 'The cycle could not reset task time.');
    }

    setTasks((prev) => prev.map((t) => ids.includes(t.id) ? { ...t, timeSpent: 0 } : t));
    setCycles((prev) => {
      const next = mergeCycles([cycleToStore], prev);
      writeLocalCycles(next);
      return next;
    });
    setShowEndCycleModal(false);

    if (error) {
      console.warn(formatSupabaseError(error, 'cycles'));
    }
  }

  function toggleCycle(id: string) {
    setExpandedCycles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    async function fetchTasks() {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, task_attachments(*)')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setTasks(data.map(rowToTask));
      }
      setLoading(false);
    }
    fetchTasks();
  }, []);

  useEffect(() => {
    async function fetchInvoices() {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setInvoices(data.map(rowToInvoice));
      }
      setInvoicesLoading(false);
    }
    fetchInvoices();
  }, []);

  function rowToInvoice(row: Record<string, unknown>): Invoice {
    return {
      id: row.id as string,
      invoiceNumber: row.invoice_number as string,
      clientName: row.client_name as string,
      clientEmail: (row.client_email as string) ?? undefined,
      items: (row.items as Invoice['items']) ?? [],
      notes: (row.notes as string) ?? undefined,
      dueDate: (row.due_date as string) ?? undefined,
      billedFrom: (row.billed_from as string) ?? undefined,
      billedTo: (row.billed_to as string) ?? undefined,
      status: row.status as InvoiceStatus,
      createdAt: row.created_at as string,
    };
  }

  async function addInvoice(data: Omit<Invoice, 'id' | 'createdAt'>) {
    // Generate PDF immediately from form data - independent of DB result
    const invoiceForPDF: Invoice = { ...data, id: '', createdAt: new Date().toISOString() };
    await downloadInvoicePDF(invoiceForPDF);

    const { data: row, error } = await supabase
      .from('invoices')
      .insert({
        invoice_number: data.invoiceNumber,
        client_name: data.clientName,
        client_email: data.clientEmail ?? null,
        items: data.items,
        notes: data.notes ?? null,
        due_date: data.dueDate ?? null,
        billed_from: data.billedFrom ?? null,
        billed_to: data.billedTo ?? null,
        status: data.status,
      })
      .select()
      .single();
    if (!error && row) {
      setInvoices((prev) => [rowToInvoice(row as Record<string, unknown>), ...prev]);
    }
  }

  async function updateInvoice(data: Omit<Invoice, 'id' | 'createdAt'>) {
    if (!editingInvoice) return;
    const { data: row, error } = await supabase
      .from('invoices')
      .update({
        invoice_number: data.invoiceNumber,
        client_name: data.clientName,
        client_email: data.clientEmail ?? null,
        items: data.items,
        notes: data.notes ?? null,
        due_date: data.dueDate ?? null,
        billed_from: data.billedFrom ?? null,
        billed_to: data.billedTo ?? null,
        status: data.status,
      })
      .eq('id', editingInvoice.id)
      .select()
      .single();
    if (!error && row) {
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === editingInvoice.id ? rowToInvoice(row as Record<string, unknown>) : inv))
      );
    }
    setEditingInvoice(null);
  }

  async function deleteInvoice(id: string) {
    await supabase.from('invoices').delete().eq('id', id);
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
  }

  const nextInvoiceNumber = useMemo(() => {
    if (invoices.length === 0) return 'INV-001';
    const nums = invoices
      .map((inv) => {
        const match = inv.invoiceNumber.match(/(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `INV-${String(max + 1).padStart(3, '0')}`;
  }, [invoices]);

  function rowToAttachment(row: Record<string, unknown>): Attachment {
    return {
      id: row.id as string,
      taskId: row.task_id as string,
      fileName: row.file_name as string,
      fileUrl: row.file_url as string,
      fileSize: row.file_size as number,
      createdAt: row.created_at as string,
    };
  }

  function rowToTask(row: Record<string, unknown>): Task {
    const attachmentRows = (row.task_attachments as Record<string, unknown>[] | null) ?? [];
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      priority: row.priority as Priority,
      status: row.status as Status,
      dueDate: (row.due_date as string) ?? undefined,
      timeSpent: row.time_spent != null ? (row.time_spent as number) : undefined,
      category: (row.category as Category) ?? undefined,
      createdAt: row.created_at as string,
      attachments: attachmentRows.map(rowToAttachment),
    };
  }

  async function uploadFiles(taskId: string, files: File[]): Promise<Attachment[]> {
    const uploaded: Attachment[] = [];
    for (const file of files) {
      const path = `${taskId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('task-attachments')
        .upload(path, file);
      if (uploadError) continue;
      const { data: urlData } = supabase.storage
        .from('task-attachments')
        .getPublicUrl(path);
      const { data: attRow } = await supabase
        .from('task_attachments')
        .insert({ task_id: taskId, file_name: file.name, file_url: urlData.publicUrl, file_size: file.size })
        .select()
        .single();
      if (attRow) uploaded.push(rowToAttachment(attRow as Record<string, unknown>));
    }
    return uploaded;
  }

  async function deleteAttachments(ids: string[]) {
    if (ids.length === 0) return;
    await supabase.from('task_attachments').delete().in('id', ids);
  }

  async function addTask(
    data: Omit<Task, 'id' | 'createdAt' | 'attachments'>,
    newFiles: File[]
  ) {
    const { data: row, error } = await supabase
      .from('tasks')
      .insert({
        name: data.name,
        description: data.description,
        priority: data.priority,
        status: data.status,
        due_date: data.dueDate ?? null,
        time_spent: data.timeSpent ?? null,
        category: data.category ?? null,
      })
      .select()
      .single();
    if (!error && row) {
      const task = rowToTask({ ...(row as Record<string, unknown>), task_attachments: [] });
      const attachments = await uploadFiles(task.id, newFiles);
      setTasks((prev) => [{ ...task, attachments }, ...prev]);
    }
  }

  async function updateTask(
    data: Omit<Task, 'id' | 'createdAt' | 'attachments'>,
    newFiles: File[],
    removedAttachmentIds: string[]
  ) {
    if (!editingTask) return;
    const { data: row, error } = await supabase
      .from('tasks')
      .update({
        name: data.name,
        description: data.description,
        priority: data.priority,
        status: data.status,
        due_date: data.dueDate ?? null,
        time_spent: data.timeSpent ?? null,
        category: data.category ?? null,
      })
      .eq('id', editingTask.id)
      .select()
      .single();
    if (!error && row) {
      await deleteAttachments(removedAttachmentIds);
      const newAttachments = await uploadFiles(editingTask.id, newFiles);
      const keptAttachments = (editingTask.attachments ?? []).filter(
        (a) => !removedAttachmentIds.includes(a.id)
      );
      setTasks((prev) =>
        prev.map((t) =>
          t.id === editingTask.id
            ? { ...rowToTask({ ...(row as Record<string, unknown>), task_attachments: [] }), attachments: [...keptAttachments, ...newAttachments] }
            : t
        )
      );
    }
    setEditingTask(null);
  }

  function toggleAttachments(taskId: string) {
    setExpandedAttachments((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  async function deleteTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task?.attachments?.length) {
      await supabase.from('task_attachments').delete().eq('task_id', id);
    }
    await supabase.from('tasks').delete().eq('id', id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  async function toggleDone(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    // todo/in-progress -> ready-to-test; ready-to-test -> done; done -> todo
    const newStatus: Status =
      task.status === 'done' ? 'todo' :
      task.status === 'ready-to-test' ? 'done' :
      'ready-to-test';
    await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
    );
  }

  async function setTaskStatus(id: string, status: Status) {
    await supabase.from('tasks').update({ status }).eq('id', id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  const readyToTestTasks = useMemo(() => {
    return tasks.filter((t) => t.status === 'ready-to-test');
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        if (t.status === 'ready-to-test') return false;
        if (filterStatus !== 'all' && t.status !== filterStatus) return false;
        if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
        if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const aDone = a.status === 'done' ? 1 : 0;
        const bDone = b.status === 'done' ? 1 : 0;
        return aDone - bDone;
      });
  }, [tasks, filterStatus, filterPriority, search]);

  const stats = useMemo(() => {
    const totalMinutes = tasks.reduce((sum, t) => sum + (t.timeSpent ?? 0), 0);
    const timeLabel = totalMinutes === 0
      ? '0m'
      : totalMinutes >= 60
      ? `${Math.floor(totalMinutes / 60)}h${totalMinutes % 60 > 0 ? ` ${totalMinutes % 60}m` : ''}`
      : `${totalMinutes}m`;
    return {
      total: tasks.length,
      todo: tasks.filter((t) => t.status === 'todo').length,
      inProgress: tasks.filter((t) => t.status === 'in-progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
      timeLabel,
    };
  }, [tasks]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-gray-900">Dev Manager</h1>
            <nav className="flex gap-1">
              <button
                onClick={() => setView('tasks')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  view === 'tasks' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                Tasks
              </button>
              <button
                onClick={() => setView('ready-to-test')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  view === 'ready-to-test' ? 'bg-amber-50 text-amber-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                Ready to Test
                {readyToTestTasks.length > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-xs font-bold">
                    {readyToTestTasks.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setView('invoices')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  view === 'invoices' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                Invoices
              </button>
            </nav>
          </div>
          {view === 'tasks' ? (
            <button
              onClick={() => { setEditingTask(null); setShowForm(true); }}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Task
            </button>
          ) : view === 'invoices' ? (
            <button
              onClick={() => { setEditingInvoice(null); setShowInvoiceForm(true); }}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Invoice
            </button>
          ) : null}
        </div>
      </header>

      {view === 'ready-to-test' && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          {readyToTestTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full bg-amber-50 p-5 mb-4">
                <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium">Nothing to test right now</p>
              <p className="text-sm text-gray-400 mt-1">Tasks you finish will appear here before being closed</p>
            </div>
          ) : (
            <div className="space-y-3">
              {readyToTestTasks.map((task) => (
                <div key={task.id} className="bg-white rounded-xl border border-amber-200 p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">{task.name}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[task.priority]}`}>
                        {task.priority}
                      </span>
                      {task.category && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLES[task.category]}`}>
                          {CATEGORY_LABELS[task.category]}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-gray-500 line-clamp-2">{task.description}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      {task.dueDate && (
                        <p className={`text-xs ${isOverdue(task.dueDate, task.status) ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                          {isOverdue(task.dueDate, task.status) ? 'Overdue: ' : 'Due: '}
                          {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                      {task.timeSpent != null && (
                        <p className="text-xs text-gray-400">
                          &#x23F1; {task.timeSpent >= 60
                            ? `${Math.floor(task.timeSpent / 60)}h ${task.timeSpent % 60 > 0 ? `${task.timeSpent % 60}m` : ''}`.trim()
                            : `${task.timeSpent}m`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setEditingTask(task); setShowForm(true); }}
                      title="Edit task"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setTaskStatus(task.id, 'in-progress')}
                      title="Send back to In Progress"
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                      </svg>
                      Back
                    </button>
                    <button
                      onClick={() => setTaskStatus(task.id, 'done')}
                      title="Approve - mark as Done"
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {view === 'invoices' && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {/* Default hourly rate */}
          <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
            <svg className="h-4 w-4 text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-gray-500">Default hourly rate</span>
            {editingRate ? (
              <div className="flex items-center gap-2 ml-1">
                <span className="text-sm text-gray-400">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveRate(); if (e.key === 'Escape') setEditingRate(false); }}
                  autoFocus
                  placeholder="0.00"
                  className="w-24 rounded-lg border border-blue-300 px-2.5 py-1 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-100"
                />
                <button onClick={saveRate} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors">Save</button>
                <button onClick={() => setEditingRate(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 ml-1">
                <span className={`text-sm font-semibold ${defaultRate ? 'text-gray-900' : 'text-gray-400'}`}>
                  {defaultRate ? `$${defaultRate}/h` : 'Not set'}
                </span>
                <button
                  onClick={() => { setRateInput(defaultRate); setEditingRate(true); }}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  {defaultRate ? 'Edit' : 'Set rate'}
                </button>
              </div>
            )}
          </div>

          {invoicesLoading ? (
            <div className="flex justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full bg-gray-100 p-5 mb-4">
                <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium">No invoices yet</p>
              <p className="text-sm text-gray-400 mt-1">Click &ldquo;New Invoice&rdquo; to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invoices.map((invoice) => {
                const total = invoiceTotal(invoice);
                const overdue = invoice.dueDate && invoice.status !== 'paid' && new Date(invoice.dueDate) < new Date(new Date().toDateString());
                return (
                  <div
                    key={invoice.id}
                    className={`group bg-white rounded-xl border transition-all ${
                      invoice.status === 'paid'
                        ? 'border-gray-100 opacity-75'
                        : overdue
                        ? 'border-red-200'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-4 p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-gray-900">{invoice.invoiceNumber}</span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_STYLES[invoice.status]}`}>
                            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{invoice.clientName}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {invoice.clientEmail && (
                            <span className="text-xs text-gray-400">{invoice.clientEmail}</span>
                          )}
                          {(invoice.billedFrom || invoice.billedTo) && (
                            <span className="text-xs text-violet-600 font-medium flex items-center gap-1">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {invoice.billedFrom && new Date(invoice.billedFrom + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {invoice.billedFrom && invoice.billedTo && ' - '}
                              {invoice.billedTo && new Date(invoice.billedTo + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                          {invoice.dueDate && (
                            <span className={`text-xs ${overdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                              {overdue ? 'Overdue: ' : 'Due: '}
                              {new Date(invoice.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{invoice.items.length} line item{invoice.items.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-base font-bold text-gray-900">{formatCurrency(total)}</div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => void downloadInvoicePDF(invoice)}
                          title="Download PDF"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => { setEditingInvoice(invoice); setShowInvoiceForm(true); }}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteInvoice(invoice.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {view === 'tasks' && <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-5 gap-3 flex-1">
            {[
              { label: 'Total', value: stats.total, color: 'text-gray-900' },
              { label: 'To Do', value: stats.todo, color: 'text-gray-600' },
              { label: 'In Progress', value: stats.inProgress, color: 'text-blue-600' },
              { label: 'Done', value: stats.done, color: 'text-emerald-600' },
              { label: 'Time Logged', value: stats.timeLabel, color: 'text-violet-600' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowEndCycleModal(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-700 hover:bg-violet-100 transition-colors whitespace-nowrap"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-xs font-medium">End Cycle</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as Status | 'all')}
            className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
          >
            <option value="all">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as Priority | 'all')}
            className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
          >
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Task List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-gray-100 p-5 mb-4">
              <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium">
              {tasks.length === 0 ? 'No tasks yet' : 'No tasks match your filters'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {tasks.length === 0 ? 'Click "Add Task" to get started' : 'Try adjusting your search or filters'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((task) => {
              const overdue = isOverdue(task.dueDate, task.status);
              return (
                <div
                  key={task.id}
                  className={`group bg-white rounded-xl border transition-all ${
                    task.status === 'done'
                      ? 'border-gray-100 opacity-70'
                      : overdue
                      ? 'border-red-200'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3 p-4">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleDone(task.id)}
                      className={`mt-0.5 flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        task.status === 'done'
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-gray-300 hover:border-emerald-400'
                      }`}
                    >
                      {task.status === 'done' && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-sm font-medium text-gray-900 ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                          {task.name}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[task.priority]}`}>
                          {task.priority}
                        </span>
                        {task.category && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLES[task.category]}`}>
                            {CATEGORY_LABELS[task.category]}
                          </span>
                        )}
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[task.status]}`}>
                          {STATUS_LABELS[task.status]}
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-sm text-gray-500 line-clamp-2">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {task.dueDate && (
                          <p className={`text-xs ${overdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            {overdue ? 'Overdue: ' : 'Due: '}
                            {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                        {task.timeSpent != null && (
                          <p className="text-xs text-gray-400">
                            &#x23F1; {task.timeSpent >= 60
                              ? `${Math.floor(task.timeSpent / 60)}h ${task.timeSpent % 60 > 0 ? `${task.timeSpent % 60}m` : ''}`.trim()
                              : `${task.timeSpent}m`}
                          </p>
                        )}
                      </div>

                      {/* Attachments toggle */}
                      {(task.attachments?.length ?? 0) > 0 && (
                        <button
                          onClick={() => toggleAttachments(task.id)}
                          className="flex items-center gap-1 mt-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {task.attachments!.length} attachment{task.attachments!.length !== 1 ? 's' : ''}
                          <svg
                            className={`h-3 w-3 transition-transform ${expandedAttachments.has(task.id) ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingTask(task); setShowForm(true); }}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded attachment list */}
                  {expandedAttachments.has(task.id) && (task.attachments?.length ?? 0) > 0 && (
                    <div className="px-4 pb-3 space-y-1 border-t border-gray-50 pt-2">
                      {task.attachments!.map((att) => (
                        <a
                          key={att.id}
                          href={att.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <svg className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          <span className="truncate flex-1">{att.fileName}</span>
                          <span className="text-gray-400 flex-shrink-0">
                            {att.fileSize < 1024 * 1024
                              ? `${(att.fileSize / 1024).toFixed(1)} KB`
                              : `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB`}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Cycle History */}
        {cycles.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Cycle History</h2>
            <div className="space-y-2">
              {cycles.map((cycle) => {
                const expanded = expandedCycles.has(cycle.id);
                const h = Math.floor(cycle.totalMinutes / 60);
                const m = cycle.totalMinutes % 60;
                const timeLabel = cycle.totalMinutes < 60 ? `${cycle.totalMinutes}m` : m > 0 ? `${h}h ${m}m` : `${h}h`;
                return (
                  <div key={cycle.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => toggleCycle(cycle.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-violet-100 p-1.5">
                          <svg className="h-3.5 w-3.5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{cycle.label}</p>
                          <p className="text-xs text-gray-400">
                            {new Date(cycle.endedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {' - '}{cycle.snapshot.length} task{cycle.snapshot.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-violet-600">{timeLabel}</span>
                        <svg className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {expanded && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {cycle.snapshot.map((entry) => {
                          const eh = Math.floor(entry.timeSpent / 60);
                          const em = entry.timeSpent % 60;
                          const entryTime = entry.timeSpent < 60 ? `${entry.timeSpent}m` : em > 0 ? `${eh}h ${em}m` : `${eh}h`;
                          return (
                            <div key={entry.taskId} className="flex items-center justify-between px-4 py-2.5">
                              <span className="text-sm text-gray-700 truncate flex-1 mr-4">{entry.taskName}</span>
                              <span className="text-xs font-medium text-violet-600 flex-shrink-0">{entryTime}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>}

      {/* Form Modal */}
      {showForm && (
        <TaskForm
          onSubmit={(data, newFiles, removedIds) =>
            editingTask ? updateTask(data, newFiles, removedIds) : addTask(data, newFiles)
          }
          onClose={() => { setShowForm(false); setEditingTask(null); }}
          initialTask={editingTask}
        />
      )}

      {showInvoiceForm && (
        <InvoiceForm
          onSubmit={(data) => editingInvoice ? updateInvoice(data) : addInvoice(data)}
          onClose={() => { setShowInvoiceForm(false); setEditingInvoice(null); }}
          initialInvoice={editingInvoice}
          nextInvoiceNumber={nextInvoiceNumber}
          tasks={tasks}
          defaultHourlyRate={defaultRate}
        />
      )}

      {showEndCycleModal && (
        <EndCycleModal
          tasks={tasks}
          cycleNumber={cycles.length + 1}
          onConfirm={endCycle}
          onClose={() => setShowEndCycleModal(false)}
        />
      )}
    </div>
  );
}
