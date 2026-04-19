'use client';

import { useState, useEffect, useRef } from 'react';
import { Task, Priority, Status, Category, Attachment } from '../types';

interface TaskFormProps {
  onSubmit: (
    task: Omit<Task, 'id' | 'createdAt' | 'attachments'>,
    newFiles: File[],
    removedAttachmentIds: string[]
  ) => Promise<string | null>;
  onClose: () => void;
  initialTask?: Task | null;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TaskForm({ onSubmit, onClose, initialTask }: TaskFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<Status>('todo');
  const [dueDate, setDueDate] = useState('');
  const [timeSpent, setTimeSpent] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialTask) {
      setName(initialTask.name);
      setDescription(initialTask.description);
      setPriority(initialTask.priority);
      setStatus(initialTask.status);
      setDueDate(initialTask.dueDate ?? '');
      setTimeSpent(initialTask.timeSpent != null ? String(initialTask.timeSpent) : '');
      setCategory(initialTask.category ?? '');
      setExistingAttachments(initialTask.attachments ?? []);
    }
  }, [initialTask]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const error = await onSubmit(
        {
          name: name.trim(),
          description: description.trim(),
          priority,
          status,
          dueDate: dueDate || undefined,
          timeSpent: timeSpent !== '' ? Number(timeSpent) : undefined,
          category: category !== '' ? category : undefined,
        },
        newFiles,
        removedAttachmentIds
      );

      if (error) {
        setSubmitError(error);
        return;
      }

      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not save the task.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setNewFiles((prev) => [...prev, ...picked]);
    e.target.value = '';
  }

  function removeNewFile(index: number) {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function removeExistingAttachment(id: string) {
    setExistingAttachments((prev) => prev.filter((a) => a.id !== id));
    setRemovedAttachmentIds((prev) => [...prev, id]);
  }

  const totalAttachments = existingAttachments.length + newFiles.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {initialTask ? 'Edit Task' : 'New Task'}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Task Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (submitError) setSubmitError('');
              }}
              placeholder="Enter task name..."
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (submitError) setSubmitError('');
              }}
              placeholder="Add a description..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value as Priority);
                  if (submitError) setSubmitError('');
                }}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as Status);
                  if (submitError) setSubmitError('');
                }}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
              >
                <option value="todo">To Do</option>
                <option value="in-progress">In Progress</option>
                <option value="ready-to-test">Ready to Test</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as Category | '');
                if (submitError) setSubmitError('');
              }}
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
            >
              <option value="">No category</option>
              <option value="bug">Bug</option>
              <option value="new-feature">New Feature</option>
              <option value="improvement">Improvement</option>
              <option value="va">VA</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  if (submitError) setSubmitError('');
                }}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Time Spent <span className="text-gray-400 font-normal">(minutes)</span>
              </label>
              <input
                type="number"
                min={0}
                value={timeSpent}
                onChange={(e) => {
                  setTimeSpent(e.target.value);
                  if (submitError) setSubmitError('');
                }}
                placeholder="e.g. 90"
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Attachments
                {totalAttachments > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-gray-400">{totalAttachments} file{totalAttachments !== 1 ? 's' : ''}</span>
                )}
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {totalAttachments === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors text-center"
              >
                Click to attach files
              </button>
            ) : (
              <div className="space-y-1.5">
                {existingAttachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <a
                      href={att.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 text-sm text-gray-700 truncate hover:text-blue-600 transition-colors"
                    >
                      {att.fileName}
                    </a>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatBytes(att.fileSize)}</span>
                    <button
                      type="button"
                      onClick={() => removeExistingAttachment(att.id)}
                      className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {newFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                    <svg className="h-4 w-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">{file.name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeNewFile(i)}
                      className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {submitting ? 'Saving...' : initialTask ? 'Save Changes' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
