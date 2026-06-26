import 'server-only';
import type { DocumentData } from '@/lib/document-data';

type Translator = (key: string, values?: Record<string, string | number>) => string;

export type DocumentRenderOptions = {
  tenantName: string;
  locale: string;
  dir: 'ltr' | 'rtl';
  currency: string;
  /** Référence courte du document (ex. 8 premiers caractères d'un id). */
  refId: string;
  /** Traducteur du namespace `admin.documents`. */
  t: Translator;
};

function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Construit la ligne « figure » mise en avant selon le type. */
function figureLine(data: DocumentData, opts: DocumentRenderOptions): string {
  const { t, locale, currency } = opts;
  if (data.attendance) {
    const rate = data.attendance.rate === null ? '—' : `${data.attendance.rate.toFixed(1)} %`;
    return `${esc(t('figures.attendance'))} : <strong>${rate}</strong> (${data.attendance.present}/${data.attendance.total})`;
  }
  if (data.finance) {
    if (data.finance.balance <= 0) {
      return `<strong>${esc(t('figures.upToDate'))}</strong> (${data.finance.totalPaid.toLocaleString(locale)} ${esc(currency)})`;
    }
    return (
      `${esc(t('figures.paid'))} : <strong>${data.finance.totalPaid.toLocaleString(locale)} / ${data.finance.totalDue.toLocaleString(locale)} ${esc(currency)}</strong>` +
      ` — ${esc(t('figures.balance'))} : <strong>${data.finance.balance.toLocaleString(locale)} ${esc(currency)}</strong>`
    );
  }
  if (data.result) {
    const avg = data.result.generalAverage === null ? '—' : `${data.result.generalAverage.toFixed(2)}/20`;
    const mention = data.result.mention ? ` — ${esc(t(`mentions.${data.result.mention}`))}` : '';
    const rank =
      data.result.rank !== null
        ? ` · ${esc(t('figures.rank'))} ${data.result.rank}/${data.result.ratedStudents}`
        : '';
    return `${esc(t('figures.average'))} : <strong>${avg}</strong>${mention}${rank}`;
  }
  return '';
}

const STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Tahoma, Arial, 'Noto Sans Arabic', sans-serif; color: #0f172a; font-size: 13px; line-height: 1.5; }
  .doc { padding: 0; }
  .head { border-bottom: 2px solid #334155; padding-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start; }
  .tenant { font-size: 20px; font-weight: 700; text-transform: uppercase; }
  .ref { text-align: end; font-size: 11px; color: #64748b; }
  .ref .num { font-family: monospace; }
  h1 { margin: 28px 0 6px; text-align: center; font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
  .rule { width: 80px; height: 3px; background: #334155; margin: 0 auto 24px; }
  .info { margin: 0 auto 22px; width: 100%; border-collapse: collapse; }
  .info td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  .info td.lbl { width: 35%; color: #64748b; }
  .info td.val { font-weight: 600; }
  .body { margin: 18px 0; text-align: justify; }
  .figure { margin: 18px 0; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 8px; padding: 12px 16px; font-size: 15px; }
  .delivered { margin-top: 22px; font-style: italic; color: #475569; }
  .sign { margin-top: 40px; display: flex; justify-content: flex-end; }
  .sign-box { width: 240px; text-align: center; }
  .sign-lbl { font-size: 11px; text-transform: uppercase; color: #64748b; border-top: 1px solid #94a3b8; padding-top: 6px; margin-top: 60px; }
  .foot { margin-top: 36px; border-top: 1px solid #e2e8f0; padding-top: 8px; text-align: center; font-size: 9px; color: #94a3b8; }
  .sched-title { margin-top: 22px; font-size: 13px; font-weight: 700; }
  .sched { width: 100%; border-collapse: collapse; margin: 8px 0 6px; font-size: 11px; }
  .sched th { background: #f1f5f9; text-align: start; padding: 6px 8px; color: #475569; text-transform: uppercase; font-size: 9px; }
  .sched td { padding: 6px 8px; border-bottom: 1px solid #eef2f7; }
  .sched .num { text-align: end; font-variant-numeric: tabular-nums; }
`;

/** Document officiel autonome (CSS inline) prêt pour Chromium → PDF. */
export function renderDocumentHTML(data: DocumentData, opts: DocumentRenderOptions): string {
  const { t, locale } = opts;
  const now = new Date().toLocaleDateString(locale, { dateStyle: 'long' });
  const birth = data.student.birthDate
    ? new Date(data.student.birthDate).toLocaleDateString(locale)
    : null;

  const infoRows: string[] = [
    `<tr><td class="lbl">${esc(t('fields.student'))}</td><td class="val">${esc(data.student.lastName)} ${esc(data.student.firstName)}</td></tr>`,
  ];
  if (birth)
    infoRows.push(`<tr><td class="lbl">${esc(t('fields.bornOn'))}</td><td class="val">${esc(birth)}</td></tr>`);
  if (data.className)
    infoRows.push(
      `<tr><td class="lbl">${esc(t('fields.class'))}</td><td class="val">${esc(data.className)}${data.levelLabel ? ` — ${esc(data.levelLabel)}` : ''}</td></tr>`,
    );
  infoRows.push(`<tr><td class="lbl">${esc(t('fields.year'))}</td><td class="val">${esc(data.yearLabel)}</td></tr>`);

  const body = t(`body.${data.type}`, {
    school: opts.tenantName,
    period: data.attendance?.periodLabel ?? data.result?.periodLabel ?? '',
    year: data.yearLabel,
  });

  const figure = figureLine(data, opts);

  // Détail de l'échéancier (attestation de paiement).
  const fmtMoney = (n: number) =>
    `${n.toLocaleString(locale, { minimumFractionDigits: 2 })} ${esc(opts.currency)}`;
  const scheduleBlock =
    data.schedule && data.schedule.length > 0
      ? `<div class="sched-title">${esc(t('schedule.title'))}</div>
    <table class="sched">
      <thead><tr>
        <th>${esc(t('schedule.label'))}</th>
        <th>${esc(t('schedule.due'))}</th>
        <th class="num">${esc(t('schedule.amount'))}</th>
        <th class="num">${esc(t('schedule.paid'))}</th>
        <th>${esc(t('schedule.status'))}</th>
      </tr></thead>
      <tbody>${data.schedule
        .map(
          (s) => `<tr>
        <td>${esc(s.label)}</td>
        <td>${new Date(s.dueDate).toLocaleDateString(locale)}</td>
        <td class="num">${fmtMoney(s.amount)}</td>
        <td class="num">${fmtMoney(s.paid)}</td>
        <td>${esc(t(`schedule.statusLabels.${s.status}`))}</td>
      </tr>`,
        )
        .join('')}</tbody>
    </table>`
      : '';

  return `<!DOCTYPE html>
<html lang="${esc(locale)}" dir="${opts.dir}">
<head>
<meta charset="utf-8" />
<title>${esc(t(`title.${data.type}`))} — ${esc(opts.tenantName)}</title>
<style>${STYLES}</style>
</head>
<body>
  <div class="doc">
    <header class="head">
      <div class="tenant">${esc(opts.tenantName)}</div>
      <div class="ref">
        <div>${esc(t('refLabel'))} : <span class="num">${esc(opts.refId)}</span></div>
        <div>${esc(now)}</div>
      </div>
    </header>

    <h1>${esc(t(`title.${data.type}`))}</h1>
    <div class="rule"></div>

    <table class="info"><tbody>${infoRows.join('')}</tbody></table>

    <p class="body">${esc(body)}</p>

    ${figure ? `<div class="figure">${figure}</div>` : ''}

    ${scheduleBlock}

    <p class="delivered">${esc(t('delivered', { date: now }))}</p>

    <div class="sign">
      <div class="sign-box"><div class="sign-lbl">${esc(t('signature'))}</div></div>
    </div>

    <footer class="foot">${esc(t('footer', { school: opts.tenantName, ref: opts.refId }))}</footer>
  </div>
</body>
</html>`;
}
