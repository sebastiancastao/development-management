export type Priority = 'low' | 'medium' | 'high';
export type Status = 'todo' | 'in-progress' | 'done';
export type Category = 'bug' | 'new-feature' | 'improvement' | 'va';

export interface Attachment {
  id: string;
  taskId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  createdAt: string;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  priority: Priority;
  status: Status;
  dueDate?: string;
  timeSpent?: number;
  category?: Category;
  createdAt: string;
  attachments?: Attachment[];
}
