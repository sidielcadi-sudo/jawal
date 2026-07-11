import { API_URL } from './config';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOpts = { token?: string | null; method?: string; body?: unknown };

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('Connexion au serveur impossible. Vérifiez le réseau et l’URL de l’API.', 0);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.error ?? `Erreur ${res.status}`, res.status);
  return data as T;
}

// ── Types partagés avec l'API ──────────────────────────────────────────────
export type Child = { id: string; firstName: string; lastName: string; className: string | null };
export type Me = { user: { id: string; email: string | null; name: string | null }; unreadMessages: number; children: Child[] };
export type Announcement = { id: string; title: string; body: string; publishedAt: string | null; audience: string };
export type Evaluation = { id: string; subject: string; label: string; date: string; maxValue: number; coefficient: number; value: number | null; classAverage: number | null };
export type Lesson = { id: string; date: string; title: string; summary: string | null; subject: string | null; teacher: string | null };
export type Homework = { id: string; dueDate: string | null; description: string; type: string; subject: string | null };
export type CarnetEntry = { id: string; type: string; content: string; occurredAt: string; authorName: string; className: string | null; subjectLabel: string | null; parentReadAt: string | null };
export type CarnetEvent = { id: string; date: string; category: string; className: string; justifStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null };
export type ConversationSummary = {
  id: string;
  subject: string;
  updatedAt: string;
  unread: boolean;
  last: { body: string; sentAt: string; mine: boolean; senderName: string | null } | null;
};
export type ThreadMessage = { id: string; body: string; sentAt: string; mine: boolean; senderName: string | null };
export type ThreadData = { id: string; subject: string; messages: ThreadMessage[] };
export type Fee = {
  id: string;
  label: string;
  amount: number;
  remaining: number;
  dueDate: string;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
};
export type Scolarite = {
  currency: string;
  paymentConfigured: boolean;
  totalDue: number;
  totalPaid: number;
  totalRemaining: number;
  fees: Fee[];
};
export type PayInit = { orderId: string; amount: number; action: string; fields: Record<string, string> };
export type PaymentStatus = { status: 'PENDING' | 'PAID' | 'FAILED'; amount: number; paidAt: string | null };

export const api = {
  login: (tenantSlug: string, email: string, password: string) =>
    request<{ token: string; user: { id: string } }>('/api/mobile/auth/login', {
      method: 'POST',
      body: { tenantSlug, email, password },
    }),
  me: (token: string) => request<Me>('/api/mobile/me', { token }),
  announcements: (token: string) => request<{ items: Announcement[] }>('/api/mobile/announcements', { token }),
  notes: (token: string, childId: string) =>
    request<{ periodId: string | null; evaluations: Evaluation[] }>(`/api/mobile/children/${childId}/notes`, { token }),
  cahier: (token: string, childId: string) =>
    request<{ lessons: Lesson[]; homeworks: Homework[] }>(`/api/mobile/children/${childId}/cahier`, { token }),
  vieScolaire: (token: string, childId: string) =>
    request<{ carnet: { entries: CarnetEntry[]; events: CarnetEvent[] } }>(`/api/mobile/children/${childId}/vie-scolaire`, { token }),
  registerPush: (token: string, expoToken: string, platform: 'ios' | 'android') =>
    request<{ ok: boolean }>('/api/mobile/push/register', { token, method: 'POST', body: { token: expoToken, platform } }),
  unregisterPush: (token: string, expoToken: string) =>
    request<{ ok: boolean }>('/api/mobile/push/register', { token, method: 'DELETE', body: { token: expoToken } }),
  testPush: (token: string) => request<{ ok: boolean; devices: number }>('/api/mobile/push/test', { token, method: 'POST' }),
  messages: (token: string) =>
    request<{ unreadCount: number; conversations: ConversationSummary[] }>('/api/mobile/messages', { token }),
  thread: (token: string, id: string) => request<ThreadData>(`/api/mobile/messages/${id}`, { token }),
  reply: (token: string, id: string, body: string) =>
    request<{ ok: boolean }>(`/api/mobile/messages/${id}/reply`, { token, method: 'POST', body: { body } }),
  startConversation: (token: string, subject: string, body: string) =>
    request<{ ok: boolean; id: string }>('/api/mobile/messages', { token, method: 'POST', body: { subject, body } }),
  scolarite: (token: string, childId: string) =>
    request<Scolarite>(`/api/mobile/children/${childId}/scolarite`, { token }),
  initPayment: (token: string, childId: string, installmentIds: string[]) =>
    request<PayInit>(`/api/mobile/children/${childId}/pay`, { token, method: 'POST', body: { installmentIds } }),
  paymentStatus: (token: string, orderId: string) =>
    request<PaymentStatus>(`/api/mobile/payments/${orderId}`, { token }),
};
