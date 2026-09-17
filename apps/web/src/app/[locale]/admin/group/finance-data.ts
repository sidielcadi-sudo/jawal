import 'server-only';
import { withTenant } from '@/lib/db';
import { yearInstallmentEnd } from '@/lib/school-year';
import { tenantDisplayName } from '@/lib/tenant-name';
import { localizedLabel } from '@/lib/localized-name';
import {
  buildYearFin,
  forecast,
  monthIndex,
  FIN_MONTHS,
  type FinCat,
  type FinInstallment,
  type YearFin,
} from '@/lib/group-finance';
import { siteColors } from './charts';

export type FinanceSite = {
  tenantId: string;
  name: string;
  color: string;
  students: number;
  currency: string;
  /** Établissement de la session : ses impayés sont accessibles directement. */
  isCurrent: boolean;
  current: YearFin | null;
  previous: YearFin | null;
  forecast: Array<{ month: string; amount: number }>;
};

export type GroupFinanceData = {
  sites: FinanceSite[];
  currentLabel: string | null;
  previousLabel: string | null;
  monthLabels: string[];
  /** Trimestres de l'année active, exprimés en rangs de mois de la grille. */
  periods: Array<{ key: string; label: string; months: number[] }>;
};

/**
 * Charge, établissement par établissement, les échéances de l'année active et
 * de la précédente, ventilées par mois et par catégorie de frais.
 */
export async function loadGroupFinance(
  sites: Array<{ tenantId: string; name: string }>,
  currentTenantId: string,
  locale: string,
): Promise<GroupFinanceData> {
  const today = new Date();
  const loaded = await Promise.all(
    sites.map((site) =>
      withTenant(site.tenantId, async (tx) => {
        const years = await tx.academicYear.findMany({
          orderBy: { startDate: 'asc' },
          include: { periods: { orderBy: { startDate: 'asc' } } },
        });
        const active = years.find((y) => y.active) ?? null;
        const previous = active
          ? ([...years].reverse().find((y) => y.startDate < active.startDate) ?? null)
          : null;

        const [tenant, feeItems, students] = await Promise.all([
          tx.tenant.findFirst({ select: { name: true, nameAr: true, currency: true } }),
          tx.feeScheduleItem.findMany({ select: { id: true, category: true } }),
          active
            ? tx.studentClass.count({
                where: { unenrolledAt: null, class: { academicYearId: active.id, deletedAt: null } },
              })
            : Promise.resolve(0),
        ]);
        const catOf = new Map(feeItems.map((f) => [f.id, f.category as FinCat]));

        const load = async (year: typeof active): Promise<FinInstallment[]> => {
          if (!year) return [];
          const rows = await tx.installment.findMany({
            where: { status: { not: 'CANCELLED' }, dueDate: { gte: year.startDate, lt: yearInstallmentEnd(year) } },
            select: {
              amount: true,
              dueDate: true,
              studentId: true,
              feeScheduleItemId: true,
              supportCourseId: true,
              exceptionalFeeAssignment: { select: { id: true } },
              payments: { select: { amount: true, paidAt: true } },
              student: { select: { relationsAsChild: { select: { parentId: true }, take: 1 } } },
            },
          });
          return rows.map((r) => ({
            amount: Number(r.amount),
            dueDate: r.dueDate,
            category: r.exceptionalFeeAssignment
              ? 'EXCEPTIONAL'
              : r.supportCourseId
                ? 'SUPPORT'
                : ((r.feeScheduleItemId ? catOf.get(r.feeScheduleItemId) : undefined) ?? 'OTHER'),
            // Sans parent rattaché, l'élève fait foyer à lui seul.
            family: r.student.relationsAsChild[0]?.parentId ?? `s:${r.studentId}`,
            payments: r.payments.map((p) => ({ amount: Number(p.amount), paidAt: p.paidAt })),
          }));
        };
        const [currentItems, previousItems] = await Promise.all([load(active), load(previous)]);

        return {
          site: {
            tenantId: site.tenantId,
            name: tenantDisplayName(locale, tenant?.name ?? site.name, tenant?.nameAr),
            students,
            currency: tenant?.currency ?? 'MAD',
            isCurrent: site.tenantId === currentTenantId,
            current: active ? buildYearFin(active.label, currentItems, active.startDate, today) : null,
            previous: previous ? buildYearFin(previous.label, previousItems, previous.startDate, today) : null,
            forecast: forecast(currentItems, today),
          },
          active,
          previousLabel: previous?.label ?? null,
        };
      }),
    ),
  );

  const colors = siteColors(loaded.map((l) => l.site.name));
  const ref = loaded.find((l) => l.active)?.active ?? null;
  const monthLabels = Array.from({ length: FIN_MONTHS }, (_, k) => {
    const base = ref?.startDate ?? today;
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + k, 1)).toLocaleDateString(locale, {
      month: 'short',
      timeZone: 'UTC',
    });
  });
  const trimesters = (ref?.periods ?? []).filter((p) => p.kind === 'TRIMESTER');
  const periods = ref
    ? trimesters.map((p) => {
        const from = monthIndex(p.startDate, ref.startDate);
        const to = monthIndex(p.endDate, ref.startDate);
        return {
          key: p.id,
          label: localizedLabel(locale, p.label, (p as { labelAr?: string | null }).labelAr ?? null),
          months: Array.from({ length: to - from + 1 }, (_, i) => from + i),
        };
      })
    : [];

  return {
    sites: loaded.map((l) => ({ ...l.site, color: colors[l.site.name]! })),
    currentLabel: ref?.label ?? null,
    previousLabel: loaded.find((l) => l.previousLabel)?.previousLabel ?? null,
    monthLabels,
    periods,
  };
}
