import { getTranslations } from 'next-intl/server';
import {
  averageWithDelta,
  attendanceRate,
  settlementRate,
  fillRate,
  kpiTone,
  type AttendanceCounts,
  type GradeRow,
} from '@/lib/class-kpis';

const TONE: Record<string, { card: string; value: string }> = {
  good: { card: 'border-emerald-200 bg-emerald-50', value: 'text-emerald-700' },
  warn: { card: 'border-amber-200 bg-amber-50', value: 'text-amber-700' },
  bad: { card: 'border-rose-200 bg-rose-50', value: 'text-red-700' },
  none: { card: 'border-slate-200 bg-slate-50', value: 'text-slate-400' },
};

/**
 * Les quatre indicateurs d'une classe, empilés dans la colonne de droite.
 *
 * Une carte par ligne : la colonne est étroite, et quatre chiffres côte à côte
 * y seraient illisibles. Chacune rend `—` plutôt qu'un zéro quand sa base
 * manque — une classe sans note ni appel ce trimestre n'est pas une classe à
 * 0 %, et la confusion se paierait en décisions.
 */
export async function ClassKpis({
  enrolled,
  capacity,
  periodLabel,
  classGrades,
  schoolGrades,
  counts,
  dueToDate,
  paidToDate,
}: {
  enrolled: number;
  capacity: number;
  periodLabel: string | null;
  classGrades: GradeRow[];
  schoolGrades: GradeRow[];
  counts: AttendanceCounts;
  dueToDate: number;
  paidToDate: number;
}) {
  const t = await getTranslations('admin.classes.kpi');

  const fill = fillRate(enrolled, capacity);
  const { average, delta } = averageWithDelta(classGrades, schoolGrades);
  const presence = attendanceRate(counts);
  const settlement = settlementRate(dueToDate, paidToDate);

  return (
    <div className="space-y-3">
      <Card
        label={t('headcount')}
        value={String(enrolled)}
        unit={t('ofMax', { capacity })}
        hint={fill === null ? undefined : t('fill', { pct: fill })}
        // Une classe pleine n'est pas un problème ; une classe qui déborde si.
        tone={fill === null ? 'none' : fill > 100 ? 'bad' : fill >= 60 ? 'good' : 'warn'}
      />
      <Card
        label={periodLabel ? t('averageOn', { period: periodLabel }) : t('average')}
        value={average === null ? '—' : average.toFixed(1).replace('.', ',')}
        unit={average === null ? undefined : '/20'}
        hint={
          delta === null
            ? t('noComparison')
            : t('vsGroup', { delta: `${delta > 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')}` })
        }
        tone={kpiTone(average, 12, 10)}
      />
      <Card
        label={t('attendance')}
        value={presence === null ? '—' : String(presence)}
        unit={presence === null ? undefined : '%'}
        hint={
          presence === null
            ? t('noAttendance')
            : t('absences', { count: counts.absent + counts.late })
        }
        tone={kpiTone(presence, 95, 90)}
      />
      <Card
        label={t('settlement')}
        value={settlement === null ? '—' : String(settlement)}
        unit={settlement === null ? undefined : '%'}
        hint={settlement === null ? t('noDue') : t('dueToDate')}
        tone={kpiTone(settlement, 90, 70)}
      />
    </div>
  );
}

function Card({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone: 'good' | 'warn' | 'bad' | 'none';
}) {
  const c = TONE[tone]!;
  return (
    <div className={`rounded-xl border px-4 py-3 ${c.card}`}>
      <div className="text-[11px] font-medium text-slate-600">{label}</div>
      <div className={`text-2xl font-bold leading-tight tabular-nums ${c.value}`}>
        {value}
        {unit && <span className="ms-1 text-sm font-normal text-slate-500">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}
