'use client';

import { useState, useEffect, useMemo } from 'react';
import { Invoice, InvoiceItem, InvoiceStatus, Task } from '../types';

interface InvoiceFormProps {
  onSubmit: (data: Omit<Invoice, 'id' | 'createdAt'>) => void;
  onClose: () => void;
  initialInvoice?: Invoice | null;
  nextInvoiceNumber?: string;
  tasks?: Task[];
  defaultHourlyRate?: string;
}

const emptyItem = (): InvoiceItem => ({ description: '', quantity: 1, rate: 0, amount: 0 });

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function minutesToHours(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

function formatTime(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function InvoiceForm({ onSubmit, onClose, initialInvoice, nextInvoiceNumber, tasks = [], defaultHourlyRate = '' }: InvoiceFormProps) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('draft');
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
  const [notes, setNotes] = useState('');

  // Billing period
  const [billedFrom, setBilledFrom] = useState('');
  const [billedTo, setBilledTo] = useState('');
  const [hourlyRate, setHourlyRate] = useState(defaultHourlyRate);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [showTaskImport, setShowTaskImport] = useState(false);

  useEffect(() => {
    if (initialInvoice) {
      setInvoiceNumber(initialInvoice.invoiceNumber);
      setClientName(initialInvoice.clientName);
      setClientEmail(initialInvoice.clientEmail ?? '');
      setDueDate(initialInvoice.dueDate ?? '');
      setStatus(initialInvoice.status);
      setItems(initialInvoice.items.length > 0 ? initialInvoice.items : [emptyItem()]);
      setNotes(initialInvoice.notes ?? '');
      setBilledFrom(initialInvoice.billedFrom ?? '');
      setBilledTo(initialInvoice.billedTo ?? '');
    } else if (nextInvoiceNumber) {
      setInvoiceNumber(nextInvoiceNumber);
    }
  }, [initialInvoice, nextInvoiceNumber]);

  // All tasks that have time logged
  const availableTasks = useMemo(() => {
    return tasks.filter((t) => t.timeSpent != null && t.timeSpent > 0);
  }, [tasks]);

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const totalBillingMinutes = availableTasks
    .filter((t) => selectedTaskIds.has(t.id))
    .reduce((sum, t) => sum + (t.timeSpent ?? 0), 0);

  function updateItem(index: number, field: keyof InvoiceItem, value: string | number) {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      if (field === 'quantity' || field === 'rate') {
        item.amount = Math.round(Number(item.quantity) * Number(item.rate) * 100) / 100;
      }
      next[index] = item;
      return next;
    });
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleTaskSelection(id: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllTasks() {
    setSelectedTaskIds(new Set(availableTasks.map((t) => t.id)));
  }

  function clearTaskSelection() {
    setSelectedTaskIds(new Set());
  }

  function importSelectedTasks() {
    const rate = parseFloat(hourlyRate) || 0;
    const selected = availableTasks.filter((t) => selectedTaskIds.has(t.id));
    const newItems: InvoiceItem[] = selected.map((t) => {
      const qty = minutesToHours(t.timeSpent!);
      return {
        description: t.name,
        quantity: qty,
        rate,
        amount: Math.round(qty * rate * 100) / 100,
      };
    });
    setItems((prev) => {
      const nonEmpty = prev.filter((item) => item.description.trim() !== '');
      return [...nonEmpty, ...newItems];
    });
    setSelectedTaskIds(new Set());
    setShowTaskImport(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceNumber.trim() || !clientName.trim()) return;
    const validItems = items.filter((item) => item.description.trim());
    onSubmit({
      invoiceNumber: invoiceNumber.trim(),
      clientName: clientName.trim(),
      clientEmail: clientEmail.trim() || undefined,
      dueDate: dueDate || undefined,
      billedFrom: billedFrom || undefined,
      billedTo: billedTo || undefined,
      status,
      items: validItems,
      notes: notes.trim() || undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {initialInvoice ? 'Edit Invoice' : 'New Invoice'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Invoice # and Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Invoice # <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-001"
                required
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>

          {/* Client */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Acme Corp"
                required
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Client Email</label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>

          {/* Billing period + due date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Billing Period</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From</label>
                <input
                  type="date"
                  value={billedFrom}
                  onChange={(e) => setBilledFrom(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <input
                  type="date"
                  value={billedTo}
                  onChange={(e) => setBilledTo(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Import tasks from billing period */}
          {tasks.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowTaskImport((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <svg className="h-4 w-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Import tasks by time logged
                  {availableTasks.length > 0 && (
                    <span className="ml-1 text-xs font-normal text-gray-500">
                      {availableTasks.length} task{availableTasks.length !== 1 ? 's' : ''} with time logged
                    </span>
                  )}
                </span>
                <svg
                  className={`h-4 w-4 text-gray-400 transition-transform ${showTaskImport ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showTaskImport && (
                <div className="p-4 space-y-3">
                  {/* Hourly rate */}
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600 whitespace-nowrap">Hourly rate ($)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      placeholder="0.00"
                      className="w-32 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                    {availableTasks.length > 0 && (
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllTasks}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Select all
                        </button>
                        {selectedTaskIds.size > 0 && (
                          <button
                            type="button"
                            onClick={clearTaskSelection}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {availableTasks.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">
                      {tasks.filter((t) => t.timeSpent && t.timeSpent > 0).length === 0
                        ? 'No tasks have time logged yet.'
                        : 'No tasks with time logged in this period.'}
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {availableTasks.map((task) => {
                        const checked = selectedTaskIds.has(task.id);
                        const hours = minutesToHours(task.timeSpent!);
                        const rate = parseFloat(hourlyRate) || 0;
                        return (
                          <label
                            key={task.id}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                              checked ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-transparent hover:bg-gray-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTaskSelection(task.id)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">{task.name}</span>
                            <span className="text-xs text-violet-600 font-medium whitespace-nowrap flex-shrink-0">
                              {formatTime(task.timeSpent!)}
                            </span>
                            {rate > 0 && (
                              <span className="text-xs text-emerald-600 font-medium whitespace-nowrap flex-shrink-0">
                                {formatCurrency(hours * rate)}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {selectedTaskIds.size > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-500">
                        {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''} &middot; {formatTime(totalBillingMinutes)} total
                        {parseFloat(hourlyRate) > 0 && (
                          <span className="ml-1 text-emerald-600 font-medium">
                            &middot; {formatCurrency(minutesToHours(totalBillingMinutes) * parseFloat(hourlyRate))}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={importSelectedTasks}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add to invoice
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Line Items</label>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add line
              </button>
            </div>

            {/* Header */}
            <div className="grid grid-cols-12 gap-2 mb-1 px-1">
              <span className="col-span-5 text-xs font-medium text-gray-500">Description</span>
              <span className="col-span-2 text-xs font-medium text-gray-500 text-right">Qty (h)</span>
              <span className="col-span-2 text-xs font-medium text-gray-500 text-right">Rate</span>
              <span className="col-span-2 text-xs font-medium text-gray-500 text-right">Amount</span>
              <span className="col-span-1" />
            </div>

            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(i, 'description', e.target.value)}
                    placeholder="Service or task"
                    className="col-span-5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                    className="col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 text-right outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.rate}
                    onChange={(e) => updateItem(i, 'rate', parseFloat(e.target.value) || 0)}
                    className="col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 text-right outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                  <span className="col-span-2 text-sm text-gray-700 text-right pr-1 font-medium">
                    {formatCurrency(item.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    disabled={items.length === 1}
                    className="col-span-1 flex justify-center rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-20 disabled:pointer-events-none"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
              <span className="text-sm text-gray-500 mr-4">Total</span>
              <span className="text-base font-bold text-gray-900">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, thank you note, etc."
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {initialInvoice ? 'Save Changes' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
