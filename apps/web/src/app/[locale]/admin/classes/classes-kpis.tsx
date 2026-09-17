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
 *
 * Même dessin que les cartes de la liste Élèves : horizontales, fond teinté,
 * une teinte par carte pour les distinguer.
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
      >
        {t('enrolled')} : {nb(kpis.enrolled)} · {t('capacity')} : {nb(kpis.capacity)}
      </Card>

      {/* Sur-chargée = au-delà de la capacité déclarée ; sous-chargée = sous
          60 % de celle-ci. Une classe sans capacité saisie n'est ni l'une ni
          l'autre : c'est un oubli de paramétrage, pas une alerte d'effectif. */}
      <Card
        icon="⚠"
        tone={alerts > 0 ? 'red' : 'slate'}
        label={t('alerts')}
        value={t('classCount', { count: alerts })}
        alert={alerts > 0}
      >
        {t('overfilled', { count: kpis.overfilled })} · {t('underfilled', { count: kpis.underfilled })}
      </Card>

      <Card
        icon="✅"
        tone="emerald"
        label={t('attendance')}
        value={kpis.attendance === null ? '—' : `${kpis.attendance} %`}
        alert={kpis.attendance !== null && kpis.attendance < 90}
      >
        {kpis.attendance === null ? t('noAttendance') : t('attendanceHint')}
      </Card>

      <Card
        icon="🧑‍🏫"
        tone="violet"
        label={t('supervision')}
        value={ppRate === null ? '—' : t('ppRate', { pct: ppRate })}
      >
        {t('mainTeachers')} : {kpis.withMainTeacher}/{kpis.classes}
        {kpis.withoutDelegate > 0 && ` · ${t('noDelegate', { count: kpis.withoutDelegate })}`}
      </Card>
    </div>
  );
}

const CARD: Record<string, string> = {
  sky: 'border-sky-200 bg-sky-50',
  emerald: 'border-emerald-200 bg-emerald-50',
  violet: 'border-violet-200 bg-violet-50',
  red: 'border-rose-200 bg-rose-50',
  slate: 'border-slate-200 bg-slate-50',
};

const ICON: Record<string, string> = {
  sky: 'text-sky-700',
  emerald: 'text-emerald-700',
  violet: 'text-violet-700',
  red: 'text-red-700',
  slate: 'text-slate-600',
};

function Card({
  icon,
  tone,
  label,
  value,
  alert = false,
  children,
}: {
  icon: string;
  tone: 'sky' | 'emerald' | 'violet' | 'red' | 'slate';
  label: string;
  value: string;
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${CARD[tone]}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/70 text-base ${ICON[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-slate-600">{label}</p>
        <p className={`text-xl font-bold leading-tight tabular-nums ${alert ? 'text-red-700' : 'text-slate-900'}`}>
          {value}
        </p>
        <p className="truncate text-[11px] text-slate-500">{children}</p>
      </div>
    </div>
  );
}
