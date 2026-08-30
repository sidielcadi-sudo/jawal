/**
 * Composants UI du tableau de bord KPI « Préparation EDT ».
 * Tous server-rendered (pas de state client), 100% statique au load.
 */

type T = (key: string, params?: Record<string, string | number>) => string;

// ─── Jauge circulaire ─────────────────────────────────────────

export function CircularGauge({
  label,
  value,
  max,
  pct,
  unit,
  hint,
  alert,
}: {
  label: string;
  value: number;
  max: number;
  pct: number;
  unit: string;
  hint: string;
  alert?: string | null;
}) {
  const radius = 60;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(pct, 100) / 100) * circumference;
  // Capacité suffisante = vert ; léger dépassement = orange ; surcharge = rouge.
  const color = pct <= 100 ? '#10b981' : pct <= 110 ? '#f59e0b' : '#ef4444';
  const bgColor = '#e2e8f0';

  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
      <div className="mt-3 flex items-center justify-center">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={radius} fill="none" stroke={bgColor} strokeWidth={stroke} />
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 80 80)"
          />
          <text
            x="80"
            y="78"
            textAnchor="middle"
            className="fill-slate-900"
            style={{ fontSize: 26, fontWeight: 600 }}
          >
            {value}
            {unit}
          </text>
          <text
            x="80"
            y="100"
            textAnchor="middle"
            className="fill-slate-500"
            style={{ fontSize: 12 }}
          >
            / {max}
            {unit}
          </text>
        </svg>
      </div>
      <div className="mt-2 text-center">
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${
            pct >= 100
              ? 'bg-emerald-100 text-emerald-700'
              : pct >= 95
                ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-700'
          }`}
        >
          {pct}%
        </span>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">{hint}</p>
      {alert && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-center text-[10px] text-amber-800">
          ⚠ {alert}
        </p>
      )}
    </div>
  );
}

// ─── Taux d'utilisation prévisionnel ───────────────────────────

export function UtilizationCard({
  expected,
  contractual,
  pct,
  t,
}: {
  expected: number;
  contractual: number;
  pct: number;
  t: T;
}) {
  const color = pct > 100 ? 'red' : pct >= 85 ? 'amber' : pct >= 50 ? 'emerald' : 'blue';
  const colorClasses: Record<string, { bg: string; text: string; bar: string }> = {
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-500' },
    red: { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-500' },
  };
  const c = colorClasses[color]!;
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">{t('utilization.title')}</h3>
      <div className="mt-3 flex items-baseline gap-3">
        <span className={`text-4xl font-bold ${c.text}`}>{pct}%</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
          {t(`utilization.label.${color}`)}
        </span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${c.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="mt-3 text-xs text-slate-600">
        {t('utilization.hint', { expected, contractual })}
      </p>
      {pct > 100 && <p className="mt-2 text-[10px] text-red-700">{t('utilization.surcharge')}</p>}
    </div>
  );
}

// ─── Couverture prévisionnelle (avant affectations) ────────────

export function ForecastCoverageCard({
  contractual,
  programHours,
  utilizationPct,
  t,
}: {
  contractual: number;
  programHours: number;
  utilizationPct: number;
  t: T;
}) {
  // Taux prévisionnel = besoin du programme / capacité contractuelle.
  // > 100% = capacité insuffisante ; sinon il reste de la marge.
  const status = utilizationPct > 100 ? 'short' : utilizationPct >= 85 ? 'tight' : 'ok';
  const color = status === 'short' ? 'red' : status === 'tight' ? 'amber' : 'emerald';
  const colorClasses: Record<string, { bg: string; text: string; bar: string }> = {
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-500' },
    red: { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' },
  };
  const c = colorClasses[color]!;
  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        {t('forecast.title')}
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
          {t('forecast.badge')}
        </span>
      </h3>
      <div className="mt-3 flex items-baseline gap-3">
        <span className={`text-4xl font-bold ${c.text}`}>{utilizationPct}%</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
          {t(`forecast.label.${status}`)}
        </span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${c.bar}`} style={{ width: `${Math.min(utilizationPct, 100)}%` }} />
      </div>
      <p className="mt-3 text-xs text-slate-600">
        {t('forecast.hint', { contractual, programHours })}
      </p>
      {utilizationPct > 100 && (
        <p className="mt-2 text-[10px] text-red-700">{t('forecast.surcharge')}</p>
      )}
    </div>
  );
}

// ─── Score global ──────────────────────────────────────────────

export function ScoreCard({ score, t }: { score: number; t: T }) {
  const color = score >= 90 ? 'emerald' : score >= 75 ? 'amber' : score >= 50 ? 'orange' : 'red';
  const colorClasses: Record<string, { bg: string; text: string; bar: string }> = {
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-500' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-700', bar: 'bg-orange-500' },
    red: { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' },
  };
  const c = colorClasses[color]!;

  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">{t('score.title')}</h3>
      <div className="mt-3 flex items-baseline gap-3">
        <span className={`text-4xl font-bold ${c.text}`}>{score}%</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
          {t(`score.label.${color}`)}
        </span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${c.bar}`} style={{ width: `${score}%` }} />
      </div>
      <p className="mt-3 text-xs text-slate-600">
        {score >= 75 ? t('score.hintOk') : score >= 50 ? t('score.hintWarn') : t('score.hintErr')}
      </p>
    </div>
  );
}

// ─── Cohérence matière-prof-classe ─────────────────────────────

export function CoherenceCard({
  subjectsWithoutTeacher,
  teachersWithoutAssignment,
  duplicates,
  t,
}: {
  subjectsWithoutTeacher: number;
  teachersWithoutAssignment: number;
  duplicates: number;
  t: T;
}) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">{t('coherence.title')}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        <Row
          icon={subjectsWithoutTeacher > 0 ? '⚠' : '✓'}
          label={t('coherence.subjectsNoTeacher')}
          value={subjectsWithoutTeacher}
          alert={subjectsWithoutTeacher > 0}
        />
        <Row
          icon={teachersWithoutAssignment > 0 ? 'ℹ' : '✓'}
          label={t('coherence.teachersNoSubject')}
          value={teachersWithoutAssignment}
          neutral={true}
        />
        <Row
          icon={duplicates > 0 ? '⚠' : '✓'}
          label={t('coherence.duplicates')}
          value={duplicates}
          alert={duplicates > 0}
        />
      </ul>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  alert,
  neutral,
}: {
  icon: string;
  label: string;
  value: number;
  alert?: boolean;
  neutral?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-1.5">
      <span className="flex items-center gap-2 text-xs text-slate-600">
        <span className={alert ? 'text-red-700' : neutral ? 'text-slate-500' : 'text-emerald-700'}>
          {icon}
        </span>
        <span>{label}</span>
      </span>
      <span
        className={`rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
          alert
            ? 'bg-red-100 text-red-700'
            : neutral
              ? 'bg-slate-100 text-slate-700'
              : 'bg-emerald-100 text-emerald-700'
        }`}
      >
        {value}
      </span>
    </li>
  );
}

// ─── Barres horizontales (salles) ──────────────────────────────

type Bar = {
  label: string;
  value: number;
  max: number;
  color: 'emerald' | 'amber' | 'red' | 'blue';
};

export function HorizontalBars({ title, bars }: { title: string; bars: Bar[] }) {
  const colorMap = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
  };
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <div className="mt-3 space-y-2.5">
        {bars.map((b, i) => (
          <div key={i}>
            <div className="mb-0.5 flex items-center justify-between text-xs">
              <span className="text-slate-700">{b.label}</span>
              <span className="font-medium tabular-nums text-slate-900">{b.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full ${colorMap[b.color]}`}
                style={{ width: `${Math.min(100, (b.value / Math.max(b.max, 1)) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Disponibilités profs vs grille ────────────────────────────

export function TeacherAvailabilityCard({
  totalTeachers,
  empty,
  emptyList,
  noSpecialtyList,
  sharedRoomList,
  uncovered,
  uncoveredCells,
  avg,
  t,
}: {
  totalTeachers: number;
  empty: number;
  emptyList: string[];
  noSpecialtyList: string[];
  sharedRoomList: Array<{ room: string; teachers: string[] }>;
  uncovered: number;
  uncoveredCells: Array<{ day: string; startTime: string; endTime: string }>;
  avg: number;
  t: T;
}) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">{t('teacherAvailability.title')}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        <Row
          icon={empty > 0 ? '⚠' : '✓'}
          label={t('teacherAvailability.emptyDispos')}
          value={empty}
          alert={empty > 0}
        />
        {emptyList.length > 0 && (
          <li className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
            <div className="flex flex-wrap gap-1.5">
              {emptyList.map((name, i) => (
                <span
                  key={i}
                  className="rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] text-amber-800"
                >
                  {name}
                </span>
              ))}
            </div>
          </li>
        )}
        <Row
          icon={noSpecialtyList.length > 0 ? '⚠' : '✓'}
          label={t('teacherAvailability.noSpecialty')}
          value={noSpecialtyList.length}
          alert={noSpecialtyList.length > 0}
        />
        {noSpecialtyList.length > 0 && (
          <li className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
            <div className="flex flex-wrap gap-1.5">
              {noSpecialtyList.map((name, i) => (
                <span
                  key={i}
                  className="rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] text-amber-800"
                >
                  {name}
                </span>
              ))}
            </div>
          </li>
        )}
        <Row
          icon={sharedRoomList.length > 0 ? '⚠' : '✓'}
          label={t('teacherAvailability.sharedRoom')}
          value={sharedRoomList.length}
          alert={sharedRoomList.length > 0}
        />
        {sharedRoomList.length > 0 && (
          <li className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
            <div className="flex flex-wrap gap-1.5">
              {sharedRoomList.map((s, i) => (
                <span
                  key={i}
                  className="rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] text-amber-800"
                >
                  {s.room} : {s.teachers.join(' / ')}
                </span>
              ))}
            </div>
          </li>
        )}
        <Row
          icon={uncovered > 0 ? '⚠' : '✓'}
          label={t('teacherAvailability.uncoveredSlots')}
          value={uncovered}
          alert={uncovered > 0}
        />
        {uncoveredCells.length > 0 && (
          <li className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
            <div className="flex flex-wrap gap-1.5">
              {uncoveredCells.map((c, i) => (
                <span
                  key={i}
                  className="rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] tabular-nums text-amber-800"
                >
                  {t(`teacherAvailability.daysShort.${c.day}` as never)} {c.startTime}–{c.endTime}
                </span>
              ))}
            </div>
          </li>
        )}
        <li className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-1.5">
          <span className="text-xs text-slate-600">{t('teacherAvailability.avg')}</span>
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-blue-700">
            {avg} / {totalTeachers}
          </span>
        </li>
      </ul>
    </div>
  );
}

// ─── Conflits structurels ──────────────────────────────────────

type ConflictItem = {
  day: string;
  startTime: string;
  endTime: string;
  name: string;
  items: string[];
};

function ConflictChips({ list, t }: { list: ConflictItem[]; t: T }) {
  if (list.length === 0) return null;
  return (
    <li className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
      <div className="flex flex-wrap gap-1.5">
        {list.map((c, i) => (
          <span
            key={i}
            className="rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] tabular-nums text-amber-800"
          >
            {c.name} · {t(`teacherAvailability.daysShort.${c.day}` as never)} {c.startTime}–
            {c.endTime}
            {c.items.length > 0 ? ` · ${c.items.join(' / ')}` : ''}
          </span>
        ))}
      </div>
    </li>
  );
}

export function ConflictsCard({
  teacher,
  room,
  cls,
  teacherList,
  roomList,
  classList,
  t,
}: {
  teacher: number;
  room: number;
  cls: number;
  teacherList: ConflictItem[];
  roomList: ConflictItem[];
  classList: ConflictItem[];
  t: T;
}) {
  const total = teacher + room + cls;
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">
        {t('conflicts.title')}
        {total === 0 && (
          <span className="ms-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            ✓ {t('conflicts.none')}
          </span>
        )}
      </h3>
      <ul className="mt-3 space-y-2 text-sm">
        <Row
          icon={teacher > 0 ? '⚠' : '✓'}
          label={t('conflicts.teacher')}
          value={teacher}
          alert={teacher > 0}
        />
        <ConflictChips list={teacherList} t={t} />
        <Row icon={room > 0 ? '⚠' : '✓'} label={t('conflicts.room')} value={room} alert={room > 0} />
        <ConflictChips list={roomList} t={t} />
        <Row icon={cls > 0 ? '⚠' : '✓'} label={t('conflicts.class')} value={cls} alert={cls > 0} />
        <ConflictChips list={classList} t={t} />
      </ul>
    </div>
  );
}

// ─── Charge horaire des profs ──────────────────────────────────

export function TeacherLoadCard({
  overloaded,
  underloaded,
  ok,
  distribution,
  t,
}: {
  overloaded: number;
  underloaded: number;
  ok: number;
  distribution: Array<{ teacherId: string; name: string; weeklyHours: number }>;
  t: T;
}) {
  const maxH = Math.max(...distribution.map((d) => d.weeklyHours), 1);
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{t('teacherLoad.title')}</h3>
        <div className="flex gap-1.5 text-[10px]">
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">⬆ {overloaded}</span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">⬇ {underloaded}</span>
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">✓ {ok}</span>
        </div>
      </div>
      {distribution.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">{t('teacherLoad.empty')}</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {distribution.map((d) => {
            const overload = d.weeklyHours > 24;
            const underload = d.weeklyHours < 8 && d.weeklyHours > 0;
            const color = overload ? 'bg-red-500' : underload ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <div key={d.teacherId} className="flex items-center gap-2 text-xs">
                <span className="w-28 truncate text-slate-700">{d.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full ${color}`}
                    style={{ width: `${Math.min(100, (d.weeklyHours / maxH) * 100)}%` }}
                  />
                </div>
                <span className="w-12 text-end tabular-nums text-slate-900">{d.weeklyHours}h</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[10px] text-slate-400">{t('teacherLoad.thresholds')}</p>
    </div>
  );
}

// ─── Grille horaire ────────────────────────────────────────────

export function ScheduleCard({
  slotsTotal,
  slotsPlaceable,
  breaks,
  daysActive,
  ok,
  t,
}: {
  slotsTotal: number;
  slotsPlaceable: number;
  breaks: number;
  daysActive: number;
  ok: boolean;
  t: T;
}) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{t('schedule.title')}</h3>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {ok ? '✓ OK' : '⚠'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Stat label={t('schedule.slots')} value={`${slotsPlaceable}/${slotsTotal}`} />
        <Stat label={t('schedule.breaks')} value={breaks} />
        <Stat label={t('schedule.daysActive')} value={daysActive} />
      </div>
    </div>
  );
}

// ─── Contraintes pédagogiques ──────────────────────────────────

export function PedagogicalCard({
  overloaded,
  ok,
  avg,
  t,
}: {
  overloaded: number;
  ok: number;
  avg: number;
  t: T;
}) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">{t('pedagogical.title')}</h3>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Stat label={t('pedagogical.ok')} value={ok} color="emerald" />
        <Stat label={t('pedagogical.overloaded')} value={overloaded} color="red" />
        <Stat label={t('pedagogical.avg')} value={`${avg}h`} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: 'emerald' | 'red';
}) {
  const colorClass =
    color === 'emerald' ? 'text-emerald-700' : color === 'red' ? 'text-red-700' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-100 px-2 py-1.5">
      <div className={`text-base font-semibold tabular-nums ${colorClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
