import Link from 'next/link';
import { rateColor, type StudentReport } from '@/lib/competency-report';

export type SynthesisRow = { studentId: string; name: string; report: StudentReport };

/**
 * Synthèse de classe : une ligne par élève, une colonne par domaine.
 * Objectif : repérer d'un coup d'œil qui décroche et sur quel domaine.
 */
export function ClassSynthesis({
  rows,
  domains,
  labels,
  hrefFor,
}: {
  rows: SynthesisRow[];
  domains: { id: string; label: string; kind: 'DISCIPLINARY' | 'TRANSVERSAL' }[];
  labels: {
    student: string;
    disciplinary: string;
    transversal: string;
    coverage: string;
    empty: string;
  };
  hrefFor?: (studentId: string) => string;
}) {
  const cell = (rate: number | null) => (
    <span
      className="inline-block min-w-[3rem] rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums"
      style={{
        backgroundColor: rate === null ? '#f1f5f9' : `${rateColor(rate)}1f`,
        color: rate === null ? '#94a3b8' : rateColor(rate),
      }}
    >
      {rate === null ? '—' : `${Math.round(rate)}%`}
    </span>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-brand-200 bg-white">
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
          <tr>
            <th className="px-4 py-3 text-start">{labels.student}</th>
            {domains.map((d) => (
              <th key={d.id} className="px-2 py-3 text-center font-medium normal-case" title={d.label}>
                <span className="line-clamp-2 text-[11px] leading-tight">{d.label}</span>
              </th>
            ))}
            <th className="px-3 py-3 text-center">{labels.disciplinary}</th>
            <th className="px-3 py-3 text-center">{labels.transversal}</th>
            <th className="px-3 py-3 text-center">{labels.coverage}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const byId = new Map(r.report.domains.map((d) => [d.id, d]));
            return (
              <tr key={r.studentId}>
                <td className="px-4 py-2.5 font-medium text-slate-900">
                  {hrefFor ? (
                    <Link href={hrefFor(r.studentId)} className="hover:text-brand-700 hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                </td>
                {domains.map((d) => (
                  <td key={d.id} className="px-2 py-2.5 text-center">
                    {cell(byId.get(d.id)?.rate ?? null)}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center">{cell(r.report.disciplinaryRate)}</td>
                <td className="px-3 py-2.5 text-center">{cell(r.report.transversalRate)}</td>
                <td className="px-3 py-2.5 text-center text-xs tabular-nums text-slate-500">
                  {r.report.covered}/{r.report.total}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={domains.length + 4} className="px-4 py-10 text-center text-slate-500">
                {labels.empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
