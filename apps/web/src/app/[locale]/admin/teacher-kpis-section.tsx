import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaAdmin, withTenant } from '@/lib/db';
import { computeTeacherKpis, type TeacherRow } from '@/lib/kpi-admin-teachers';
import { GroupedBars } from './teacher-bars';

const BLUE = '#3b82f6';
const ORANGE = '#f59e0b';

/** Catégorie « RH / Enseignants » du tableau de bord Admin. */
export async function TeacherKpisSection({ periodId }: { periodId: string | null }) {
  const session = (await auth())!;
  const t = await getTranslations('admin.teacherKpis');

  const tenant = await prismaAdmin.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { timezone: true },
  });
  const k = await withTenant(session.user.tenantId, (tx) =>
    computeTeacherKpis(tx, { periodId, tz: tenant?.timezone || 'Africa/Casablanca' }),
  );

  const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} %`);
  const num = (v: number | null) => (v === null ? '—' : v.toFixed(1));
  // Lignes utiles aux tableaux : profs ayant une activité.
  const active = k.rows.filter((r) => r.expected > 0 || r.avg !== null || r.assignedHours > 0);

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400">{t('teacherCount', { count: k.teacherCount })}</p>

      {/* 1. Présence & appels */}
      <SubBlock title={t('presence.title')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('presence.rate')} value={pct(k.presencePct)} tone={rateTone(k.presencePct, 95, 85)} />
          <Stat label={t('presence.absent')} value={pct(k.absentPct)} tone={invTone(k.absentPct, 5, 10)} />
          <Stat label={t('presence.late')} value={pct(k.latePct)} tone={invTone(k.latePct, 5, 10)} />
          <Stat label={t('presence.notDone')} value={String(k.notDoneTotal)} tone={k.notDoneTotal > 0 ? 'red' : 'emerald'} />
        </div>
        <Table
          head={[t('presence.table.teacher'), t('presence.table.presence'), t('presence.table.absent'), t('presence.table.late'), t('presence.table.notDone')]}
          rows={active.map((r) => [
            r.name,
            pct(r.presencePct),
            pct(r.absentPct),
            pct(r.latePct),
            r.expected ? `${r.notDone} (${(r.notDonePct ?? 0).toFixed(0)} %)` : '—',
          ])}
        />
      </SubBlock>

      {/* 2. Pédagogie */}
      <SubBlock title={t('pedagogy.title')}>
        <Table
          head={[t('pedagogy.table.teacher'), t('pedagogy.table.avg'), t('pedagogy.table.level'), t('pedagogy.table.success'), t('pedagogy.table.difficulty')]}
          rows={active
            .filter((r) => r.avg !== null)
            .map((r) => [
              r.name,
              `${num(r.avg)}${r.levelAvg !== null && r.avg !== null ? deltaTag(r.avg - r.levelAvg) : ''}`,
              num(r.levelAvg),
              pct(r.successPct),
              pct(r.difficultyPct),
            ])}
        />
        <ChartTitle>{t('pedagogy.progression')}</ChartTitle>
        {k.hasPrev ? (
          <GroupedBars
            data={progData(active)}
            series={[{ name: t('pedagogy.progressionSeries'), color: ORANGE }]}
            unit="%"
          />
        ) : (
          <p className="text-xs italic text-slate-400">{t('pedagogy.noPrev')}</p>
        )}
      </SubBlock>

      {/* 3. Charge horaire */}
      <SubBlock title={t('load.title')}>
        <ChartTitle>{t('load.hoursTitle')}</ChartTitle>
        <GroupedBars
          data={active.map((r) => ({ label: r.name, values: [r.contractualHours, r.assignedHours] }))}
          series={[
            { name: t('load.planned'), color: BLUE },
            { name: t('load.realized'), color: ORANGE },
          ]}
          unit="h"
        />

        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{t('load.overtimeTotal')}</span>
            <span className="font-semibold tabular-nums text-amber-700">{k.overtimeTotal.toFixed(1)} h</span>
          </div>
          {k.topOvertime.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {k.topOvertime.map((o) => (
                <li key={o.name} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{o.name}</span>
                  <span className="font-medium tabular-nums text-amber-700">+{o.overtime.toFixed(1)} h</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ChartTitle>{t('load.classesTitle')}</ChartTitle>
        <GroupedBars
          data={active.map((r) => ({ label: r.name, values: [r.assignedHours, r.classCount] }))}
          series={[
            { name: t('load.hoursWeek'), color: BLUE },
            { name: t('load.classes'), color: ORANGE },
          ]}
        />
      </SubBlock>
    </div>
  );

  function progData(rows: TeacherRow[]) {
    return rows
      .filter((r) => r.progressionPct !== null)
      .map((r) => ({ label: r.name, values: [r.progressionPct] }));
  }

  function deltaTag(d: number) {
    return ` (${d >= 0 ? '+' : ''}${d.toFixed(1)})`;
  }
}

// Tonalités (rate haut = bon ; inv = bas = bon).
function rateTone(v: number | null, green: number, amber: number): Tone {
  if (v === null) return 'slate';
  return v >= green ? 'emerald' : v >= amber ? 'amber' : 'red';
}
function invTone(v: number | null, green: number, amber: number): Tone {
  if (v === null) return 'slate';
  return v <= green ? 'emerald' : v <= amber ? 'amber' : 'red';
}

type Tone = 'emerald' | 'amber' | 'red' | 'slate';
const TONE: Record<Tone, string> = {
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
  slate: 'text-slate-700',
};

function SubBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ChartTitle({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 text-xs font-medium text-slate-500">{children}</div>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${TONE[tone]}`}>{value}</div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-100 table-head text-xs uppercase tracking-wide text-slate-700">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={i === 0 ? 'px-3 py-2 text-start' : 'px-3 py-2 text-end'}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={
                    ci === 0
                      ? 'px-3 py-2 font-medium text-slate-800'
                      : 'px-3 py-2 text-end tabular-nums text-slate-700'
                  }
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
