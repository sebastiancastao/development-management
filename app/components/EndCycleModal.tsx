'use client';

import { useState } from 'react';
import { Task } from '../types';

interface EndCycleModalProps {
  tasks: Task[];
  cycleNumber: number;
  onConfirm: (label: string) => Promise<void>;
  onClose: () => void;
}

function formatTime(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function EndCycleModal({ tasks, cycleNumber, onConfirm, onClose }: EndCycleModalProps) {
  const tasksWithTime = tasks.filter((t) => t.timeSpent && t.timeSpent > 0);
  const totalMinutes = tasksWithTime.reduce((sum, t) => sum + (t.timeSpent ?? 0), 0);
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const [label, setLabel] = useState(`Cycle ${cycleNumber} - ${today}`);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    if (!label.trim() || tasksWithTime.length === 0) return;
    setLoading(true);
    setError('');

    try {
      await onConfirm(label.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not end the cycle.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-violet-100 p-1.5">
              <svg className="h-4 w-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-900">End Cycle</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Summary */}
          <div className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-violet-900">{tasksWithTime.length} task{tasksWithTime.length !== 1 ? 's' : ''} with time logged</p>
              <p className="text-xs text-violet-600 mt-0.5">Will be reset to 0 after saving</p>
            </div>
            <span className="text-xl font-bold text-violet-700">{formatTime(totalMinutes)}</span>
          </div>

          {/* Task list preview */}
          {tasksWithTime.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1">
              {tasksWithTime.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="text-sm text-gray-700 truncate flex-1 mr-3">{t.name}</span>
                  <span className="text-xs font-medium text-violet-600 flex-shrink-0">{formatTime(t.timeSpent!)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Cycle label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Cycle label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (error) setError('');
              }}
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition-all"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {tasksWithTime.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">No tasks have time logged - nothing to cycle.</p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={tasksWithTime.length === 0 || loading || !label.trim()}
              className="flex-1 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              End Cycle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
