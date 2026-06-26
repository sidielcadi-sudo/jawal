/** Bulletin de paie autonome (HTML → PDF). Bilingue FR / AR (RTL en arabe). */

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export type PayslipPdfData = {
  tenantName: string;
  currency: string;
  period: string;
  employee: { name: string; cin?: string | null; cnss?: string | null };
  gains: { baseSalary: number; seniorityBonus: number; transport: number; housing: number; benefits: number; overtime: number };
  brut: number;
  retenues: { cnss: number; amo: number; cimr: number; ir: number; internal: number };
  netImposable: number;
  netPayable: number;
  employer: { cnss: number; family: number; amo: number; training: number; total: number };
};

const L = {
  fr: {
    title: 'Bulletin de paie', period: 'Période', employee: 'Employé', cin: 'CIN', cnss: 'N° CNSS',
    gains: 'Gains', base: 'Salaire de base', seniority: 'Prime d’ancienneté', transport: 'Indemnité de transport',
    housing: 'Indemnité de logement', benefits: 'Avantages en nature', overtime: 'Heures supplémentaires',
    brut: 'Salaire brut', retenues: 'Retenues', amo: 'AMO', cimr: 'CIMR', ir: 'IR (Impôt sur le Revenu)',
    internal: 'Retenues internes', netImposable: 'Salaire net imposable', net: 'NET À PAYER',
    employer: 'Charges patronales', family: 'Allocations familiales', training: 'Taxe de formation', total: 'Coût total employeur',
    generated: 'Document généré le',
  },
  ar: {
    title: 'ورقة الأجور', period: 'الفترة', employee: 'الموظف', cin: 'البطاقة الوطنية', cnss: 'رقم CNSS',
    gains: 'المكتسبات', base: 'الأجر الأساسي', seniority: 'علاوة الأقدمية', transport: 'تعويض النقل',
    housing: 'تعويض السكن', benefits: 'مزايا عينية', overtime: 'الساعات الإضافية',
    brut: 'الأجر الإجمالي', retenues: 'الاقتطاعات', amo: 'AMO', cimr: 'CIMR', ir: 'الضريبة على الدخل',
    internal: 'اقتطاعات داخلية', netImposable: 'الأجر الصافي الخاضع', net: 'الصافي المستحق',
    employer: 'تكاليف المشغل', family: 'التعويضات العائلية', training: 'ضريبة التكوين', total: 'التكلفة الإجمالية للمشغل',
    generated: 'وثيقة صادرة بتاريخ',
  },
};

export function buildPayslipHtml(d: PayslipPdfData, locale: string): string {
  const t = locale === 'ar' ? L.ar : L.fr;
  const rtl = locale === 'ar';
  const cur = esc(d.currency);
  const fmt = (n: number) => `${n.toLocaleString(locale === 'ar' ? 'ar-MA' : 'fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
  const today = new Date().toLocaleDateString(locale === 'ar' ? 'ar-MA' : 'fr-FR');
  const row = (label: string, value: number) => `<tr><td>${esc(label)}</td><td class="num">${fmt(value)}</td></tr>`;

  return `<!DOCTYPE html><html lang="${locale}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"/>
<style>
  * { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
  body { margin: 0; color: #1e293b; font-size: 12px; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1A56DB; padding-bottom:10px; }
  .estab { font-size:16px; font-weight:700; color:#143fa6; }
  h1 { font-size:18px; margin:4px 0 0; }
  .meta { margin-top:10px; font-size:12px; color:#475569; }
  .meta b { color:#1e293b; }
  .cols { display:flex; gap:16px; margin-top:14px; }
  .col { flex:1; }
  .col h2 { font-size:13px; margin:0 0 4px; color:#143fa6; }
  table { width:100%; border-collapse:collapse; }
  td { padding:5px 8px; border-bottom:1px solid #eef2f7; }
  .num { text-align:${rtl ? 'left' : 'right'}; font-variant-numeric:tabular-nums; }
  .sub { background:#f8fafc; font-weight:600; }
  .net { margin-top:16px; background:#ecfdf5; border:1px solid #6ee7b7; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; }
  .net .lbl { font-size:14px; font-weight:700; color:#065f46; }
  .net .val { font-size:20px; font-weight:800; color:#065f46; }
  .employer { margin-top:14px; }
  .employer h2 { font-size:12px; color:#64748b; margin:0 0 4px; }
  .foot { margin-top:20px; font-size:10px; color:#94a3b8; text-align:center; }
</style></head><body>
  <div class="head">
    <div>
      <div class="estab">${esc(d.tenantName)}</div>
      <h1>${t.title}</h1>
    </div>
    <div style="text-align:${rtl ? 'left' : 'right'}; font-size:12px; color:#475569;">
      <div><b>${t.period}:</b> ${esc(d.period)}</div>
    </div>
  </div>

  <div class="meta">
    <b>${t.employee}:</b> ${esc(d.employee.name)}
    ${d.employee.cin ? ` &nbsp;·&nbsp; <b>${t.cin}:</b> ${esc(d.employee.cin)}` : ''}
    ${d.employee.cnss ? ` &nbsp;·&nbsp; <b>${t.cnss}:</b> ${esc(d.employee.cnss)}` : ''}
  </div>

  <div class="cols">
    <div class="col">
      <h2>${t.gains}</h2>
      <table>
        ${row(t.base, d.gains.baseSalary)}
        ${d.gains.seniorityBonus ? row(t.seniority, d.gains.seniorityBonus) : ''}
        ${d.gains.transport ? row(t.transport, d.gains.transport) : ''}
        ${d.gains.housing ? row(t.housing, d.gains.housing) : ''}
        ${d.gains.benefits ? row(t.benefits, d.gains.benefits) : ''}
        ${d.gains.overtime ? row(t.overtime, d.gains.overtime) : ''}
        <tr class="sub"><td>${esc(t.brut)}</td><td class="num">${fmt(d.brut)}</td></tr>
      </table>
    </div>
    <div class="col">
      <h2>${t.retenues}</h2>
      <table>
        ${row('CNSS', d.retenues.cnss)}
        ${row(t.amo, d.retenues.amo)}
        ${d.retenues.cimr ? row(t.cimr, d.retenues.cimr) : ''}
        ${row(t.ir, d.retenues.ir)}
        ${d.retenues.internal ? row(t.internal, d.retenues.internal) : ''}
        <tr class="sub"><td>${esc(t.netImposable)}</td><td class="num">${fmt(d.netImposable)}</td></tr>
      </table>
    </div>
  </div>

  <div class="net">
    <span class="lbl">${t.net}</span>
    <span class="val">${fmt(d.netPayable)}</span>
  </div>

  <div class="employer">
    <h2>${t.employer}</h2>
    <table>
      ${row('CNSS', d.employer.cnss)}
      ${row(t.family, d.employer.family)}
      ${row(t.amo, d.employer.amo)}
      ${row(t.training, d.employer.training)}
      <tr class="sub"><td>${esc(t.total)}</td><td class="num">${fmt(d.employer.total)}</td></tr>
    </table>
  </div>

  <div class="foot">${esc(d.tenantName)} — ${t.generated} ${esc(today)}</div>
</body></html>`;
}
