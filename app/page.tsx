'use client';

import { useState, useEffect, useMemo } from 'react';
import TaskForm from './components/TaskForm';
import { Task, Priority, Status, Category } from './types';
import { supabase } from '../lib/supabase';

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};

const STATUS_STYLES: Record<Status, string> = {
  'todo': 'bg-gray-100 text-gray-600',
  'in-progress': 'bg-blue-100 text-blue-700',
  'done': 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS: Record<Status, string> = {
  'todo': 'To Do',
  'in-progress': 'In Progress',
  'done': 'Done',
};

const CATEGORY_STYLES: Record<Category, string> = {
  'bug': 'bg-rose-100 text-rose-700',
  'new-feature': 'bg-violet-100 text-violet-700',
  'improvement': 'bg-cyan-100 text-cyan-700',
};

const CATEGORY_LABELS: Record<Category, string> = {
  'bug': 'Bug',
  'new-feature': 'New Feature',
  'improvement': 'Improvement',
};

function isOverdue(dueDate?: string, status?: Status) {
  if (!dueDate || status === 'done') return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTasks() {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setTasks(data.map(rowToTask));
      }
      setLoading(false);
    }
    fetchTasks();
  }, []);

  function rowToTask(row: Record<string, unknown>): Task {
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
    };
  }

  async function addTask(data: Omit<Task, 'id' | 'createdAt'>) {
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
      setTasks((prev) => [rowToTask(row), ...prev]);
    }
  }

  async function updateTask(data: Omit<Task, 'id' | 'createdAt'>) {
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
      setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? rowToTask(row) : t)));
    }
    setEditingTask(null);
  }

  async function deleteTask(id: string) {
    await supabase.from('tasks').delete().eq('id', id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  async function toggleDone(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const newStatus: Status = task.status === 'done' ? 'todo' : 'done';
    await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
    );
  }

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
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
          <div>
            <h1 className="text-xl font-bold text-gray-900">Task Manager</h1>
            <p className="text-xs text-gray-500 mt-0.5">{stats.total} tasks total</p>
          </div>
          <button
            onClick={() => { setEditingTask(null); setShowForm(true); }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Task
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
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
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Form Modal */}
      {showForm && (
        <TaskForm
          onSubmit={editingTask ? updateTask : addTask}
          onClose={() => { setShowForm(false); setEditingTask(null); }}
          initialTask={editingTask}
        />
      )}
    </div>
  );
}
