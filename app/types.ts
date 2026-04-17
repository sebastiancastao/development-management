export type Priority = 'low' | 'medium' | 'high';
export type Status = 'todo' | 'in-progress' | 'done';
export type Category = 'bug' | 'new-feature' | 'improvement' | 'va';
export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail?: string;
  items: InvoiceItem[];
  notes?: string;
  dueDate?: string;
  billedFrom?: string;
  billedTo?: string;
  status: InvoiceStatus;
  createdAt: string;
}

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
