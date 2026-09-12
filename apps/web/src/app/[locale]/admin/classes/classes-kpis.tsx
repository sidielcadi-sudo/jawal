import { getTranslations } from 'next-intl/server';
import { fillRate } from '@/lib/class-kpis';

export type ClassesKpiData = {
  enrolled: number;
  capacity: number;
  overfilled: number;
  underfilled: number;
  attendance: number | null;
  classes: number;
  withMainTeacher: number;
  withoutDelegate: number;
};

/**
 * Les quatre indicateurs de tête de la liste des classes.
 *
 * Ils portent sur le **périmètre affiché** — année et cycle choisis — et non
 * sur tout l'établissement : on les lit juste au-dessus du tableau qu'ils
 * résument, et un total qui ne bougerait pas en changeant de cycle laisserait
 * croire à une erreur.
 */
export async function ClassesKpis({ kpis }: { kpis: ClassesKpiData }) {
  const t = await getTranslations('admin.classes.overview');
  const fill = fillRate(kpis.enrolled, kpis.capacity);
  const alerts = kpis.overfilled + kpis.underfilled;
  const ppRate =
    kpis.classes > 0 ? Math.round((kpis.withMainTeacher / kpis.classes) * 1000) / 10 : null;

  const nb = (n: number) => n.toLocaleString('fr-FR');

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        icon="👥"
        tone="sky"
        label={t('fill')}
        value={fill === null ? '—' : `${fill.toFixed(1).replace('.', ',')} %`}
        valueTone="text-brand-800"
      >
        <span>
          {t('enrolled')} : <strong className="text-slate-700">{nb(kpis.enrolled)}</strong>
        </span>
        <span>
          {t('capacity')} : <strong className="text-slate-700">{nb(kpis.capacity)}</strong>
        </span>
      </Card>

      <Card
        icon="⚠"
        tone={alerts > 0 ? 'amber' : 'slate'}
        label={t('alerts')}
        value={t('classCount', { count: alerts })}
        valueTone={alerts > 0 ? 'text-amber-700' : 'text-slate-400'}
      >
        {/* Sur-chargée = au-delà de la capacité déclarée ; sous-chargée = sous
            60 % de celle-ci. Une classe sans capacité saisie n'est ni l'une ni
            l'autre : c'est un oubli de paramétrage, pas une alerte d'effectif. */}
        <span className="text-red-600">{t('overfilled', { count: kpis.overfilled })}</span>
        <span className="text-amber-600">{t('underfilled', { count: kpis.underfilled })}</span>
      </Card>

      <Card
        icon="✅"
        tone="emerald"
        label={t('attendance')}
        value={kpis.attendance === null ? '—' : `${kpis.attendance} %`}
        valueTone={
          kpis.attendance === null
            ? 'text-slate-400'
            : kpis.attendance >= 95
              ? 'text-emerald-700'
              : kpis.attendance >= 90
                ? 'text-amber-700'
                : 'text-red-700'
        }
      >
        <span>{kpis.attendance === null ? t('noAttendance') : t('attendanceHint')}</span>
      </Card>

      <Card
        icon="🧑‍🏫"
        tone="violet"
        label={t('supervision')}
        value={ppRate === null ? '—' : t('ppRate', { pct: ppRate })}
        valueTone="text-brand-800"
      >
        <span>
          {t('mainTeachers')} :{' '}
          <strong className="text-slate-700">
            {kpis.withMainTeacher}/{kpis.classes}
          </strong>
        </span>
        {kpis.withoutDelegate > 0 && (
          <span className="text-amber-600">{t('noDelegate', { count: kpis.withoutDelegate })}</span>
        )}
      </Card>
    </div>
  );
}

function Card({
  icon,
  tone,
  label,
  value,
  valueTone,
  children,
}: {
  icon: string;
  tone: 'sky' | 'amber' | 'emerald' | 'violet' | 'slate';
  label: string;
  value: string;
  valueTone: string;
  children: React.ReactNode;
}) {
  const iconTone: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
    slate: 'bg-slate-100 text-slate-500',
  };
  return (
    <section className="rounded-2xl border border-brand-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-slate-700">{label}</h2>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base ${iconTone[tone]}`}>
          {icon}
        </span>
      </div>
      <p className={`mt-2 text-3xl font-extrabold tabular-nums ${valueTone}`}>{value}</p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">{children}</div>
    </section>
  );
}
