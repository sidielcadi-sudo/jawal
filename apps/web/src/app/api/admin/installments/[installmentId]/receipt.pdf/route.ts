import { auth } from '@/lib/auth';
import { withTenant, prismaAdmin } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';
import { getTenantLogoDataUri } from '@/lib/tenant-logo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Espèces',
  CHEQUE: 'Chèque',
  TRANSFER: 'Virement',
  CMI: 'Carte (CMI)',
  STRIPE: 'Carte',
  OTHER: 'Autre',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/**
 * GET /api/admin/installments/[installmentId]/receipt.pdf
 * Reçu de paiement (PDF) pour une échéance. Accessible à l'administration et
 * au parent autorisé de l'élève concerné.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ installmentId: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { installmentId } = await ctx.params;
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const inst = await tx.installment.findUnique({
      where: { id: installmentId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        payments: { orderBy: { paidAt: 'asc' } },
      },
    });
    if (!inst) return null;
    // Contrôle d'accès parent : seul le parent rattaché peut télécharger.
    if (session.user.isParent && !(await parentCanAccessChild(tx, session.user.id, inst.studentId))) {
      return null;
    }
    // Échéancier complet de l'élève (hors annulées) pour le détailler sur le reçu.
    const schedule = await tx.installment.findMany({
      where: { studentId: inst.studentId, status: { not: 'CANCELLED' } },
      include: { payments: { select: { amount: true } } },
      orderBy: { dueDate: 'asc' },
    });
    return { inst, schedule };
  });

  if (!data) return new Response('Not found', { status: 404 });
  if (data.inst.payments.length === 0) return new Response('No payment', { status: 404 });
  const inst = data.inst;
  const schedule = data.schedule;

  const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId } });
  const currency = tenant?.currency ?? 'MAD';
  const locale = tenant?.localeDefault ?? 'fr';
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const amount = Number(inst.amount);
  const paid = inst.payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, amount - paid);
  const fmt = (n: number) => `${n.toLocaleString(locale, { minimumFractionDigits: 2 })} ${currency}`;
  const receiptNo = inst.id.slice(0, 8).toUpperCase();
  const todayStr = new Date().toLocaleDateString(locale, { dateStyle: 'long' });
  const logoDataUri = await getTenantLogoDataUri(tenantId);

  const rows = inst.payments
    .map(
      (p) => `<tr>
        <td>${new Date(p.paidAt).toLocaleDateString(locale)}</td>
        <td>${esc(PAYMENT_METHOD_LABEL[p.method] ?? p.method)}</td>
        <td>${p.reference ? esc(p.reference) : '—'}</td>
        <td class="num">${fmt(Number(p.amount))}</td>
      </tr>`,
    )
    .join('');

  // Détail de l'échéancier complet de l'élève.
  const STATUS_LABEL: Record<string, string> = { PENDING: 'À payer', PARTIAL: 'Partiel', PAID: 'Payé' };
  const schedRows = schedule
    .map((s) => {
      const a = Number(s.amount);
      const p = s.payments.reduce((x, y) => x + Number(y.amount), 0);
      const cur = s.id === inst.id ? ' style="background:#eff6ff;font-weight:600"' : '';
      return `<tr${cur}>
        <td>${esc(s.label)}</td>
        <td>${new Date(s.dueDate).toLocaleDateString(locale)}</td>
        <td class="num">${fmt(a)}</td>
        <td class="num">${fmt(p)}</td>
        <td>${STATUS_LABEL[s.status] ?? esc(s.status)}</td>
      </tr>`;
    })
    .join('');
  const schedDue = schedule.reduce((s, i) => s + Number(i.amount), 0);
  const schedPaid = schedule.reduce(
    (s, i) => s + i.payments.reduce((x, y) => x + Number(y.amount), 0),
    0,
  );
  const schedRemaining = Math.max(0, schedDue - schedPaid);

  const html = `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8">
  <style>
    * { font-family: 'Segoe UI', system-ui, sans-serif; }
    body { color: #1e293b; font-size: 13px; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1A56DB; padding-bottom:12px; }
    .brand { font-size:20px; font-weight:700; color:#1A56DB; display:flex; align-items:center; gap:10px; }
    .brand img { height:38px; width:auto; object-fit:contain; }
    h1 { font-size:16px; margin:24px 0 4px; }
    .meta { color:#64748b; font-size:12px; }
    .box { margin-top:20px; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; }
    .row { display:flex; justify-content:space-between; padding:3px 0; }
    .row .lbl { color:#64748b; }
    table { width:100%; border-collapse:collapse; margin-top:18px; font-size:12px; }
    th { background:#f1f5f9; text-align:start; padding:8px; color:#475569; text-transform:uppercase; font-size:10px; }
    td { padding:8px; border-bottom:1px solid #f1f5f9; }
    .num { text-align:end; font-variant-numeric:tabular-nums; }
    .totals { margin-top:16px; margin-inline-start:auto; width:50%; }
    .totals .row.grand { font-weight:700; font-size:15px; border-top:2px solid #1A56DB; padding-top:8px; margin-top:6px; }
    .foot { margin-top:40px; color:#94a3b8; font-size:11px; text-align:center; }
  </style></head><body>
    <div class="head">
      <div class="brand">${logoDataUri ? `<img src="${logoDataUri}" alt="" />` : ''}${esc(tenant?.name ?? 'LeadSchool')}</div>
      <div class="meta">Reçu N° ${receiptNo}<br>${todayStr}</div>
    </div>
    <h1>Reçu de paiement</h1>
    <div class="box">
      <div class="row"><span class="lbl">Élève</span><span>${esc(inst.student.lastName)} ${esc(inst.student.firstName)}</span></div>
      <div class="row"><span class="lbl">Objet</span><span>${esc(inst.label)}</span></div>
      <div class="row"><span class="lbl">Montant dû</span><span>${fmt(amount)}</span></div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Mode</th><th>Référence</th><th class="num">Montant</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span class="lbl">Total versé</span><span class="num">${fmt(paid)}</span></div>
      <div class="row grand"><span>Reste à payer</span><span class="num">${fmt(remaining)}</span></div>
    </div>
    <h1 style="margin-top:28px">Échéancier de l'élève</h1>
    <table>
      <thead><tr><th>Libellé</th><th>Échéance</th><th class="num">Montant</th><th class="num">Réglé</th><th>Statut</th></tr></thead>
      <tbody>${schedRows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span class="lbl">Total dû</span><span class="num">${fmt(schedDue)}</span></div>
      <div class="row"><span class="lbl">Total réglé</span><span class="num">${fmt(schedPaid)}</span></div>
      <div class="row grand"><span>Reste global</span><span class="num">${fmt(schedRemaining)}</span></div>
    </div>
    <div class="foot">${esc(tenant?.name ?? 'LeadSchool')} — Document généré le ${todayStr}</div>
  </body></html>`;

  const pdf = await htmlToPdf(html);
  const filename = pdfFilename(`recu-${receiptNo}-${inst.student.lastName}`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`,
    },
  });
}
