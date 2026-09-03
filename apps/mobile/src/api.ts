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
export type Child = {
  id: string;
  firstName: string;
  lastName: string;
  className: string | null;
  /** URL signée de la photo de l'élève (courte durée), null si aucune. */
  photoUrl: string | null;
};
export type Me = { user: { id: string; email: string | null; name: string | null }; unreadMessages: number; children: Child[] };
export type Announcement = { id: string; title: string; body: string; publishedAt: string | null; audience: string };
export type Evaluation = { id: string; subject: string; label: string; date: string; maxValue: number; coefficient: number; value: number | null; classAverage: number | null };
export type Lesson = { id: string; date: string; title: string; summary: string | null; subject: string | null; teacher: string | null };
export type Homework = { id: string; dueDate: string | null; description: string; type: string; subject: string | null };
/** Synthèse enfant — même forme que le tableau de bord du portail élève. */
export type ChildDashboard = {
  firstName: string;
  lastName: string;
  className: string | null;
  /** URL signée de la photo de l'élève (courte durée), null si aucune. */
  photoUrl: string | null;
  attendanceRate: number | null;
  generalAverage: number | null;
  /** Périodes de l'année, dans l'ordre — index de `subjects[].byPeriod`. */
  periods: { id: string; label: string }[];
  /** `byPeriod` : une moyenne par période, alignée sur `periods`. */
  subjects: { label: string; avg: number | null; byPeriod: (number | null)[] }[];
  carnetUnread: number;
  recentCarnet: { id: string; type: string; content: string; occurredAt: string; authorName: string }[];
  recentAbsences: { id: string; date: string; cat: string; className: string }[];
};
export type TimetableCourse = {
  id: string;
  startTime: string;
  endTime: string;
  subject: string | null;
  teacher: string | null;
  room: string | null;
  isBreak: boolean;
  /** Cours annulé (modification approuvée par la vie scolaire). */
  cancelled: boolean;
  /** Nom du professeur remplaçant, si remplacement approuvé. */
  substituteName: string | null;
};
export type TimetableDay = { date: string; className: string | null; courses: TimetableCourse[] };
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
export type SupportResource = { id: string; title: string; url: string };
export type SupportSession = {
  date: string;
  time: string | null;
  topic: string | null;
  present: boolean | null;
  appreciation: string | null;
  resources: SupportResource[];
};
export type SupportCourse = {
  courseTitle: string;
  subject: string;
  teacher: string | null;
  sessions: SupportSession[];
};
export type UpcomingExam = { id: string; subject: string; label: string; date: string };
export type MasteryScaleItem = { code: string; label: string; color: string };
export type CompetencyKind = 'DISCIPLINARY' | 'TRANSVERSAL'; // Compétence / Aptitude
export type CompetencyDomain = {
  id: string;
  label: string;
  kind: CompetencyKind;
  rate: number | null;
  covered: number;
  total: number;
  /** Écart en points vs période précédente (null si non comparable). */
  delta: number | null;
  competencies: { id: string; label: string; rate: number | null; kind: CompetencyKind }[];
};
export type CompetencyReport =
  | { available: false }
  | {
      available: true;
      periodLabel: string;
      provisional: boolean;
      disciplinaryRate: number | null;
      transversalRate: number | null;
      covered: number;
      total: number;
      scale: MasteryScaleItem[];
      domains: CompetencyDomain[];
    };

// ── Espace enseignant ──────────────────────────────────────────────────────
/** Rôle porté par le jeton : détermine l'espace ouvert par l'app. */
export type MobileRole = 'parent' | 'teacher';
/** Un « service » du prof : un couple classe × matière. */
export type TeacherService = {
  classId: string;
  className: string;
  subjectId: string;
  subjectLabel: string;
};
export type TeacherMe = {
  teacher: { id: string; firstName: string; lastName: string; photoUrl: string | null };
  yearLabel: string | null;
  services: TeacherService[];
  missingAppels: number;
  unreadMessages: number;
};
/** Un cours de la journée, avec l'état de son appel. */
export type TeacherDaySession = {
  entryId: string;
  date: string;
  classId: string;
  className: string;
  subject: string | null;
  room: string | null;
  slotStart: string;
  slotEnd: string;
  periodLabel: string;
  done: boolean;
};
export type AppelStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
export type AppelStudentRow = {
  studentId: string;
  name: string;
  status: AppelStatus;
  lateMinutes: number | null;
  lateReasonId: string | null;
  infirmary: boolean;
  punishment: boolean;
  exclusion: boolean;
  note: string | null;
};
export type AppelSheet = {
  sessionId: string | null;
  finalized: boolean;
  date: string;
  className: string;
  subject: string | null;
  room: string | null;
  slotStart: string;
  slotEnd: string;
  reasons: { id: string; label: string; color: string | null }[];
  rows: AppelStudentRow[];
};
export type TeacherNotesGrid = {
  periods: { id: string; label: string }[];
  periodId: string;
  students: { id: string; name: string }[];
  devoirs: {
    id: string;
    label: string;
    date: string;
    maxValue: number;
    weight: number;
    grades: Record<string, number | null>;
  }[];
};
export type LeaveRequestItem = {
  id: string;
  typeLabel: string;
  startDate: string;
  endDate: string;
  days: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string | null;
  decisionComment: string | null;
};
export type TeacherLeave = {
  types: { id: string; label: string }[];
  requests: LeaveRequestItem[];
};

export const api = {
  login: (tenantSlug: string, email: string, password: string) =>
    request<{ token: string; user: { id: string; role: MobileRole } }>('/api/mobile/auth/login', {
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
  soutien: (token: string, childId: string) =>
    request<{ courses: SupportCourse[] }>(`/api/mobile/children/${childId}/soutien`, { token }),
  competences: (token: string, childId: string) =>
    request<CompetencyReport>(`/api/mobile/children/${childId}/competences`, { token }),
  upcoming: (token: string, childId: string) =>
    request<{ items: UpcomingExam[] }>(`/api/mobile/children/${childId}/upcoming`, { token }),
  /** Synthèse de l'enfant (moyennes, présence, carnet) — comme le portail élève. */
  dashboard: (token: string, childId: string) =>
    request<ChildDashboard>(`/api/mobile/children/${childId}/dashboard`, { token }),
  /** Cours du jour — équivalent de l'onglet « Aujourd'hui » du portail parent. */
  timetable: (token: string, childId: string, date?: string) =>
    request<TimetableDay>(
      `/api/mobile/children/${childId}/timetable${date ? `?date=${date}` : ''}`,
      { token },
    ),
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

  // ── Espace enseignant ────────────────────────────────────────────────────
  teacherMe: (token: string) => request<TeacherMe>('/api/mobile/teacher/me', { token }),
  teacherDay: (token: string, date: string) =>
    request<{ date: string; sessions: TeacherDaySession[] }>(
      `/api/mobile/teacher/day?date=${date}`,
      { token },
    ),
  appelSheet: (token: string, entryId: string, date: string) =>
    request<AppelSheet>(`/api/mobile/teacher/appel/${entryId}/${date}`, { token }),
  saveAppel: (
    token: string,
    entryId: string,
    date: string,
    body: { finalize: boolean; records: Omit<AppelStudentRow, 'name'>[] },
  ) =>
    request<{ ok: boolean }>(`/api/mobile/teacher/appel/${entryId}/${date}`, {
      token,
      method: 'POST',
      body,
    }),
  teacherNotes: (token: string, classId: string, subjectId: string, periodId?: string) =>
    request<TeacherNotesGrid>(
      `/api/mobile/teacher/notes/${classId}/${subjectId}${periodId ? `?period=${periodId}` : ''}`,
      { token },
    ),
  saveTeacherNotes: (
    token: string,
    classId: string,
    subjectId: string,
    cells: { evaluationId: string; studentId: string; value: number | null }[],
  ) =>
    request<{ ok: boolean }>(`/api/mobile/teacher/notes/${classId}/${subjectId}`, {
      token,
      method: 'POST',
      body: { cells },
    }),
  teacherLeave: (token: string) => request<TeacherLeave>('/api/mobile/teacher/leave', { token }),
  createLeave: (
    token: string,
    body: { leaveTypeId: string; startDate: string; endDate: string; reason?: string },
  ) => request<{ ok: boolean; id: string }>('/api/mobile/teacher/leave', { token, method: 'POST', body }),
};
