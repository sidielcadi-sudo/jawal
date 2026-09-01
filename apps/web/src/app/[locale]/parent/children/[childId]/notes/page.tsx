import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { loadParentChildContext } from '@/lib/parent';
import { loadClassBulletin } from '@/lib/parent-bulletin';
import { ChildTabs } from '../tabs';
import { localizedLabel } from '@/lib/localized-name';

export default async function ParentChildNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; childId: string }>;
  searchParams: Promise<{ tab?: string; period?: string }>;
}) {
  const { locale, childId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.child');
  const tab = sp.tab === 'bulletin' || sp.tab === 'classe' ? sp.tab : 'notes';

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const ctx = await loadParentChildContext(tx, session.user.id, childId);
    if (!ctx) return null;
    // Période sélectionnée : ?period=… sinon le trimestre/semestre courant. Hors
    // période (vacances/fin d'année) : dernier trimestre commencé, sinon le 1er.
    const now = new Date();
    const current = ctx.periods.find((p) => p.startDate <= now && now <= p.endDate);
    const started = ctx.periods.filter((p) => p.startDate <= now);
    const fallback = started[started.length - 1] ?? ctx.periods[0] ?? null;
    const selectedPeriod =
      ctx.periods.find((p) => p.id === sp.period) ?? current ?? fallback;

    // Onglet Notes : évaluations de la classe sur la période.
    const evaluations =
      tab === 'notes' && ctx.classId && selectedPeriod
        ? await tx.evaluation.findMany({
            where: { classId: ctx.classId, periodId: selectedPeriod.id },
            orderBy: { date: 'desc' },
            include: {
              subject: { select: { label: true, labelAr: true } },
              grades: { select: { studentId: true, value: true } },
            },
          })
        : [];
    const notes = evaluations.map((e) => {
      const childValue = e.grades.find((g) => g.studentId === childId)?.value ?? null;
      const vals = e.grades.map((g) => g.value).filter((v): v is number => v !== null);
      const classAvg = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
      return {
        id: e.id,
        subject: localizedLabel(locale, e.subject.label, e.subject.labelAr),
        label: e.label,
        date: e.date,
        max: e.maxValue,
        childValue,
        // Min/max de la classe sur cette évaluation : situe la note sans
        // révéler qui l'a obtenue.
        classMin: vals.length ? Math.min(...vals) : null,
        classMax: vals.length ? Math.max(...vals) : null,
        classAvg,
      };
    });

    // Moyenne générale de la période : moyenne par élève de ses notes
    // normalisées sur 20 (barèmes hétérogènes), puis min/max sur la classe.
    const marksByStudent = new Map<string, number[]>();
    for (const e of evaluations) {
      const scale = e.maxValue || 20;
      for (const g of e.grades) {
        if (g.value === null) continue;
        const arr = marksByStudent.get(g.studentId) ?? [];
        arr.push((g.value / scale) * 20);
        marksByStudent.set(g.studentId, arr);
      }
    }
    const studentAvgs = [...marksByStudent.entries()].map(([studentId, marks]) => ({
      studentId,
      avg: marks.reduce((sum, x) => sum + x, 0) / marks.length,
    }));
    const generalAvg = studentAvgs.length
      ? {
          min: Math.min(...studentAvgs.map((a) => a.avg)),
          max: Math.max(...studentAvgs.map((a) => a.avg)),
          child: studentAvgs.find((a) => a.studentId === childId)?.avg ?? null,
        }
      : null;

    const classBulletin =
      tab === 'classe' && ctx.classId && selectedPeriod
        ? await loadClassBulletin(tx, ctx.classId, selectedPeriod.id, childId)
        : [];

    return { ctx, selectedPeriod, notes, generalAvg, classBulletin };
  });
  if (!data) notFound();

  const base = `/${locale}/parent/children/${childId}/notes`;
  const periodQ = data.selectedPeriod ? `&period=${data.selectedPeriod.id}` : '';

  // Notes regroupées par matière.
  const bySubject = new Map<string, typeof data.notes>();
  for (const n of data.notes) {
    const arr = bySubject.get(n.subject) ?? [];
    arr.push(n);
    bySubject.set(n.subject, arr);
  }

  return (
    <>
      <ChildTabs
        current={tab}
        tabs={[
          { key: 'notes', label: t('notes.tabNotes'), href: `${base}?tab=notes${periodQ}` },
          { key: 'bulletin', label: t('notes.tabStudentBulletin'), href: `${base}?tab=bulletin${periodQ}` },
          { key: 'classe', label: t('notes.tabClassBulletin'), href: `${base}?tab=classe${periodQ}` },
        ]}
      />

      {/* Sélecteur de périodes (trimestres / semestres) */}
      {data.ctx.periods.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 overflow-x-auto">
          {data.ctx.periods.map((p) => (
            <Link
              key={p.id}
              href={`${base}?tab=${tab}&period=${p.id}`}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                data.selectedPeriod?.id === p.id
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      )}

      {!data.ctx.classId ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
          {t('noClass')}
        </p>
      ) : tab === 'notes' ? (
        bySubject.size === 0 ? (
          <p className="text-sm text-slate-400">{t('notes.empty')}</p>
        ) : (
          <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            {[...bySubject.entries()].map(([subject, list]) => (
              <div key={subject}>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {subject}
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-100">
                  <table className="w-full text-xs">
                    <thead className="table-head text-[10px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-1.5 text-start">{t('notes.evaluation')}</th>
                        <th className="px-2 py-1.5 text-end">{t('notes.mark')}</th>
                        <th className="px-2 py-1.5 text-end">{t('notes.min')}</th>
                        <th className="px-2 py-1.5 text-end">{t('notes.max')}</th>
                        <th className="px-3 py-1.5 text-end">{t('notes.classAvg')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {list.map((n) => (
                        <tr key={n.id}>
                          <td className="px-3 py-1.5 text-slate-800">
                            {n.label}
                            <span className="ms-1 text-[10px] text-slate-400">
                              {new Date(n.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-end font-semibold tabular-nums">
                            {n.childValue === null ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <span className={n.childValue < n.max / 2 ? 'text-red-700' : 'text-emerald-700'}>
                                {n.childValue}
                                <span className="text-[10px] font-normal text-slate-400">/{n.max}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-end tabular-nums text-slate-400">
                            {n.classMin === null ? '—' : n.classMin}
                          </td>
                          <td className="px-2 py-1.5 text-end tabular-nums text-slate-400">
                            {n.classMax === null ? '—' : n.classMax}
                          </td>
                          <td className="px-3 py-1.5 text-end tabular-nums text-slate-500">
                            {n.classAvg === null ? '—' : `${n.classAvg.toFixed(2)}/${n.max}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {data.generalAvg && (
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('notes.generalAvg')}
                </div>
                <dl className="flex flex-wrap items-end justify-between gap-3 text-xs">
                  <div>
                    <dt className="text-slate-500">{t('notes.childAvg')}</dt>
                    <dd className="text-lg font-semibold tabular-nums text-slate-900">
                      {data.generalAvg.child === null
                        ? '—'
                        : `${data.generalAvg.child.toFixed(2)}/20`}
                    </dd>
                  </div>
                  <div className="text-end">
                    <dt className="text-slate-500">{t('notes.min')}</dt>
                    <dd className="font-medium tabular-nums text-slate-600">
                      {data.generalAvg.min.toFixed(2)}/20
                    </dd>
                  </div>
                  <div className="text-end">
                    <dt className="text-slate-500">{t('notes.max')}</dt>
                    <dd className="font-medium tabular-nums text-slate-600">
                      {data.generalAvg.max.toFixed(2)}/20
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )
      ) : tab === 'bulletin' ? (
        data.ctx.periods.length === 0 ? (
          <p className="text-sm text-slate-400">{t('notes.bulletinEmpty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white px-5">
            {data.ctx.periods.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-800">{p.label}</span>
                <a
                  href={`/api/parent/children/${childId}/bulletin.pdf?period=${p.id}`}
                  className="rounded-lg border border-brand-600 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm hover:bg-brand-50"
                >
                  ⬇ {t('notes.download')}
                </a>
              </li>
            ))}
          </ul>
        )
      ) : (
        // Bulletin de la classe (anonyme).
        data.classBulletin.length === 0 ? (
          <p className="text-sm text-slate-400">{t('notes.empty')}</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 table-head text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-start">{t('classBulletin.subject')}</th>
                  <th className="px-2 py-2 text-end">{t('classBulletin.childAvg')}</th>
                  <th className="px-2 py-2 text-end">{t('classBulletin.rank')}</th>
                  <th className="px-2 py-2 text-end">{t('classBulletin.classAvg')}</th>
                  <th className="px-2 py-2 text-end">{t('classBulletin.min')}</th>
                  <th className="px-3 py-2 text-end">{t('classBulletin.max')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.classBulletin.map((r) => (
                  <tr key={r.subject}>
                    <td className="px-3 py-2 font-medium text-slate-800">{r.subject}</td>
                    <td className="px-2 py-2 text-end font-semibold tabular-nums">
                      {r.childAvg === null ? '—' : `${r.childAvg.toFixed(2)}`}
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums text-slate-600">
                      {r.childRank === null ? '—' : `${r.childRank}/${r.graded}`}
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums text-slate-600">
                      {r.classAvg === null ? '—' : r.classAvg.toFixed(2)}
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums text-slate-400">
                      {r.min === null ? '—' : r.min.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums text-slate-400">
                      {r.max === null ? '—' : r.max.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[11px] text-slate-400">{t('classBulletin.note')}</p>
          </div>
        )
      )}
    </>
  );
}
