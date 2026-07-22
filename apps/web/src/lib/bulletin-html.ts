import 'server-only';
import { computeMention, type Mention } from '@/lib/grades';
import type { BulletinData, BulletinStudent } from '@/lib/bulletin-data';

/** Traducteur minimal (next-intl) : `t('key', { vars })`. */
type Translator = (key: string, values?: Record<string, string | number>) => string;

export type BulletinRenderOptions = {
  tenantName: string;
  locale: string;
  dir: 'ltr' | 'rtl';
  /** Logo de l'établissement en data URI (base64), optionnel. */
  logoDataUri?: string | null;
  /** Traducteur du namespace `admin.bulletin`. */
  t: Translator;
};

/** Échappe le texte utilisateur avant insertion dans le HTML. */
function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toFixed(2);
}

const MENTION_COLORS: Record<NonNullable<Mention>, string> = {
  EXCELLENT: '#6b21a8;background:#f3e8ff',
  TRES_BIEN: '#065f46;background:#d1fae5',
  BIEN: '#1e40af;background:#dbeafe',
  ASSEZ_BIEN: '#334155;background:#f1f5f9',
  PASSABLE: '#92400e;background:#fef3c7',
  INSUFFISANT: '#991b1b;background:#fee2e2',
};

function mentionBadge(mention: Mention, t: Translator): string {
  if (!mention) return '';
  return `<span class="mention" style="color:${MENTION_COLORS[mention]}">${esc(
    t(`mentions.${mention}`),
  )}</span>`;
}

/** Markup d'un bulletin élève (section paginée). */
function renderStudentBulletin(
  bs: BulletinStudent,
  data: BulletinData,
  opts: BulletinRenderOptions,
): string {
  const { t, locale } = opts;
  const { student, row, apprec, council } = bs;
  const { cls, period, classBook, classSize } = data;

  const birth = student.birthDate
    ? new Date(student.birthDate).toLocaleDateString(locale)
    : null;
  const printedOn = new Date().toLocaleDateString(locale);

  const subjectRows = row.subjects
    .map((s) => {
      const classAvg = classBook.classSubjectAverages.get(s.subjectId);
      const mention = computeMention(s.average, s.subjectScale);
      const rank = (s as typeof s & { rank: number | null }).rank;
      return `
      <tr>
        <td class="subject"><span class="subject-label">${esc(s.subjectLabel)}</span><span class="scale">/${s.subjectScale}</span></td>
        <td class="num">${s.subjectCoefficient}</td>
        <td class="num strong">${fmt(s.average)}</td>
        <td class="num muted">${classAvg === null || classAvg === undefined ? '—' : classAvg.toFixed(2)}</td>
        <td class="num">${rank ? rank : '—'}</td>
        <td class="center">${mentionBadge(mention, t)}</td>
        <td class="apprec">${esc(apprec.get(s.subjectId)) || '<span class="dash">—</span>'}</td>
      </tr>`;
    })
    .join('');

  const generalMention = computeMention(row.generalAverage, 20);
  const generalRank =
    row.generalRank !== null ? `${row.generalRank}/${row.ratedStudents}` : '—';

  const mainTeacher = cls.mainTeacher
    ? `<span class="muted"> · ${esc(t('info.mainTeacher'))} : ${esc(cls.mainTeacher.lastName)} ${esc(cls.mainTeacher.firstName)}</span>`
    : '';

  const councilHtml =
    council?.generalAppreciation || council?.decision
      ? `
        ${council.generalAppreciation ? `<p class="council-text">${esc(council.generalAppreciation)}</p>` : ''}
        ${
          council.decision
            ? `<p class="council-decision">${esc(t('council.decision'))} : <span class="decision-badge">${esc(
                t(`council.decisions.${council.decision}`),
              )}</span></p>`
            : ''
        }`
      : `<p class="dash italic">${esc(t('council.empty'))}</p>`;

  return `
  <section class="bulletin">
    <header class="head">
      <div class="head-row">
        <div class="tenant">${
          opts.logoDataUri
            ? `<img src="${opts.logoDataUri}" alt="" class="logo" />`
            : ''
        }${esc(opts.tenantName)}</div>
        <div class="year">${esc(cls.academicYear.label)}</div>
      </div>
      <h1>${esc(t('bulletinOf', { period: period.label, year: cls.academicYear.label }))}</h1>
    </header>

    <section class="info">
      <div><span class="lbl">${esc(t('info.student'))} :</span> <strong>${esc(student.lastName)} ${esc(student.firstName)}</strong></div>
      <div><span class="lbl">${esc(t('info.class'))} :</span> <strong>${esc(cls.name)}</strong>${mainTeacher}</div>
      ${birth ? `<div><span class="lbl">${esc(t('info.bornOn'))} :</span> ${esc(birth)}</div>` : '<div></div>'}
      <div><span class="lbl">${esc(t('info.level'))} :</span> ${esc(cls.level.cycle.label)} — ${esc(cls.level.label)}</div>
      <div><span class="lbl">${esc(t('info.classSize'))} :</span> ${classSize}</div>
      <div><span class="lbl">${esc(t('info.printedOn'))} :</span> ${esc(printedOn)}</div>
    </section>

    <table class="grades">
      <thead>
        <tr>
          <th class="start">${esc(t('table.subject'))}</th>
          <th>${esc(t('table.coefficient'))}</th>
          <th>${esc(t('table.studentAvg'))}</th>
          <th>${esc(t('table.classAvg'))}</th>
          <th>${esc(t('table.rank'))}</th>
          <th>${esc(t('table.mention'))}</th>
          <th class="start">${esc(t('table.appreciation'))}</th>
        </tr>
      </thead>
      <tbody>${subjectRows}</tbody>
      <tfoot>
        <tr class="total">
          <td colspan="2" class="end strong upper">${esc(t('table.generalAvg'))}</td>
          <td class="num big">${fmt(row.generalAverage)}</td>
          <td class="num muted">${fmt(classBook.classGeneralAverage)}</td>
          <td class="num">${generalRank}</td>
          <td class="center">${mentionBadge(generalMention, t)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    ${renderCompetences(bs, opts)}

    <section class="council">
      <h2>${esc(t('council.title'))}</h2>
      ${councilHtml}
    </section>

    <section class="signatures">
      <div class="sig"><div class="sig-lbl">${esc(t('signatures.head'))}</div></div>
      <div class="sig"><div class="sig-lbl">${esc(t('signatures.parent'))}</div></div>
    </section>

    <footer class="foot">${esc(t('footer', { id: student.id.slice(0, 8) }))}</footer>
  </section>`;
}

/** Couleur d'un taux d'acquisition (alignée sur l'échelle NA → M). */
function compColor(rate: number | null): string {
  if (rate === null) return '#cbd5e1';
  if (rate < 33) return '#ef4444';
  if (rate < 55) return '#f97316';
  if (rate < 80) return '#10b981';
  return '#059669';
}

/**
 * Volet « Compétences & aptitudes » du bulletin (APC).
 * Deux blocs — disciplinaire et transversal — avec une barre par domaine et le
 * détail par compétence. Rien n'est imprimé si le module n'est pas alimenté.
 */
function renderCompetences(bs: BulletinStudent, opts: BulletinRenderOptions): string {
  const { t } = opts;
  const c = bs.competences;
  if (!c || c.total === 0) return '';

  const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r)}%`);

    const block = (kind: 'DISCIPLINARY' | 'TRANSVERSAL', title: string, globalRate: number | null) => {
    // Domaines ayant des lignes de ce type (Compétence ou Aptitude).
    const domains = c.domains
      .map((d) => ({ label: d.label, comps: d.competencies.filter((x) => x.kind === kind && x.total > 0) }))
      .filter((d) => d.comps.length > 0);
    if (domains.length === 0) return '';
    const rows = domains
      .map((d) => {
        const domRates = d.comps.filter((x) => x.rate !== null).map((x) => x.rate!);
        const domRate = domRates.length ? domRates.reduce((s, r) => s + r, 0) / domRates.length : null;
        const comps = d.comps
          .map(
            (x) =>
              `<li><span class="cname">${esc(x.label)}</span>
                 <span class="cbar"><i style="width:${x.rate ?? 0}%;background:${compColor(x.rate)}"></i></span>
                 <span class="cval">${pct(x.rate)}<span class="ccov">${x.covered}/${x.total}</span></span></li>`,
          )
          .join('');
        return `<div class="cdomain">
            <div class="chead">
              <span class="dname">${esc(d.label)}</span>
              <span class="dval" style="color:${compColor(domRate)}">${pct(domRate)}</span>
            </div>
            <ul class="clist">${comps}</ul>
          </div>`;
      })
      .join('');
    return `<div class="cblock">
        <h3>${esc(title)} <span class="cglobal" style="color:${compColor(globalRate)}">${pct(globalRate)}</span></h3>
        ${rows}
      </div>`;
  };

  const disc = block('DISCIPLINARY', t('competences.disciplinary'), c.disciplinaryRate);
  const trans = block('TRANSVERSAL', t('competences.transversal'), c.transversalRate);
  if (!disc && !trans) return '';

  return `<section class="competences">
      <h2>${esc(t('competences.title'))}${
        c.provisional ? `<span class="cprov">${esc(t('competences.provisional'))}</span>` : ''
      }</h2>
      <div class="cgrid">${disc}${trans}</div>
      <p class="cscale">${esc(t('competences.legend'))}</p>
    </section>`;
}

const STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Tahoma, Arial, 'Noto Sans Arabic', sans-serif; color: #0f172a; font-size: 12px; }
  .bulletin { padding: 0; page-break-after: always; }
  .bulletin:last-child { page-break-after: auto; }
  .head { border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; }
  .head-row { display: flex; justify-content: space-between; align-items: flex-start; }
  .tenant { font-size: 18px; font-weight: 700; text-transform: uppercase; display: flex; align-items: center; gap: 10px; }
  .tenant .logo { height: 36px; width: auto; object-fit: contain; }
  .year { font-size: 11px; color: #64748b; font-family: monospace; }
  h1 { margin: 14px 0 0; text-align: center; font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; padding: 12px 0; border-bottom: 1px solid #cbd5e1; }
  .info .lbl { color: #64748b; }
  .muted { color: #64748b; }
  table.grades { width: 100%; border-collapse: collapse; margin-top: 14px; }
  table.grades th { background: #f1f5f9; border-bottom: 2px solid #334155; padding: 6px 8px; font-size: 10px; text-transform: uppercase; text-align: center; }
  table.grades th.start { text-align: start; }
  table.grades td { border-bottom: 1px solid #e2e8f0; padding: 5px 8px; vertical-align: top; }
  td.num { text-align: center; font-variant-numeric: tabular-nums; }
  td.center { text-align: center; }
  td.strong, .strong { font-weight: 600; }
  td.big { font-size: 15px; font-weight: 700; }
  td.subject .subject-label { font-weight: 500; }
  td.subject .scale { margin-inline-start: 3px; font-size: 10px; color: #64748b; }
  td.apprec { font-size: 11px; }
  .dash { color: #cbd5e1; }
  .italic { font-style: italic; }
  .end { text-align: end; }
  .upper { text-transform: uppercase; }
  tr.total td { border-top: 2px solid #334155; background: #f1f5f9; padding: 10px 8px; }
  .mention { display: inline-block; border-radius: 4px; padding: 2px 6px; font-size: 9px; font-weight: 600; }
  .council { margin-top: 20px; border-top: 2px solid #334155; padding-top: 10px; }
  .council h2 { margin: 0 0 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .council-text { margin: 0; white-space: pre-wrap; }
  .council-decision { margin: 8px 0 0; font-weight: 600; }
  .decision-badge { border-radius: 4px; background: #f1f5f9; padding: 1px 6px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 22px; }
  .sig { border: 1px solid #cbd5e1; padding: 10px; height: 72px; }
  .sig-lbl { font-size: 10px; text-transform: uppercase; color: #64748b; }
  .foot { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; text-align: center; font-size: 9px; color: #94a3b8; }

  /* Volet compétences (APC) */
  .competences { margin-top: 18px; border-top: 2px solid #334155; padding-top: 10px; page-break-inside: avoid; }
  .competences h2 { margin: 0 0 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .cprov { margin-inline-start: 8px; border-radius: 4px; background: #fef3c7; color: #b45309; padding: 1px 6px; font-size: 9px; font-weight: 600; text-transform: none; }
  .cgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .cblock h3 { margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #334155; }
  .cglobal { margin-inline-start: 6px; font-size: 12px; }
  .cdomain { margin-bottom: 7px; }
  .chead { display: flex; justify-content: space-between; font-size: 10px; font-weight: 600; color: #475569; }
  .dval { font-weight: 700; }
  .clist { list-style: none; margin: 3px 0 0; padding: 0; }
  .clist li { display: flex; align-items: center; gap: 5px; font-size: 9px; margin-bottom: 2px; }
  .cname { flex: 0 0 42%; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cbar { flex: 1; height: 5px; border-radius: 3px; background: #f1f5f9; overflow: hidden; }
  .cbar i { display: block; height: 100%; border-radius: 3px; }
  .cval { flex: 0 0 52px; text-align: end; color: #334155; font-weight: 600; }
  .ccov { margin-inline-start: 3px; color: #cbd5e1; font-weight: 400; }
  .cscale { margin: 6px 0 0; font-size: 9px; color: #94a3b8; }
`;

/**
 * Construit le document HTML autonome (CSS inline, prêt pour Chromium → PDF)
 * d'un ou plusieurs bulletins. En lot, chaque élève occupe sa propre page.
 */
export function renderBulletinDocument(data: BulletinData, opts: BulletinRenderOptions): string {
  const body = data.students
    .map((bs) => renderStudentBulletin(bs, data, opts))
    .join('\n');
  return `<!DOCTYPE html>
<html lang="${esc(opts.locale)}" dir="${opts.dir}">
<head>
<meta charset="utf-8" />
<title>${esc(opts.tenantName)} — ${esc(opts.t('title'))}</title>
<style>${STYLES}</style>
</head>
<body>${body}</body>
</html>`;
}
