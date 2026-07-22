import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const METHOD_FR: Record<string, string> = { VIREMENT: 'Virement bancaire', CHEQUE: 'Chèque', ESPECES: 'Espèces' };
const CAT_FR: Record<string, string> = { TUITION: 'Scolarité', TRANSPORT: 'Transport', CANTEEN: 'Cantine', DAYCARE: 'Garderie', OTHER: 'Autres' };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id } = await ctx.params;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const refund = await tx.radiationRefund.findUnique({
      where: { radiationRequestId: id },
      include: { student: { select: { firstName: true, lastName: true, cin: true } } },
    });
    const tenant = await tx.tenant.findFirst({ select: { name: true, currency: true } });
    return { refund, tenant };
  });
  if (!data.refund || data.refund.status !== 'PAID') return new Response('Reçu indisponible (remboursement non payé).', { status: 404 });
  const { refund, tenant } = data;
  const s = refund.student;
  const currency = tenant?.currency ?? 'MAD';
  const amount = refund.approvedAmount != null ? Number(refund.approvedAmount) : Number(refund.computedAmount);
  const today = new Date().toLocaleDateString('fr-FR');
  const paidAt = refund.paidAt ? new Date(refund.paidAt).toLocaleDateString('fr-FR') : today;
  const money = (n: number) => `${n.toFixed(2)} ${currency}`;
  const lines = (refund.breakdown as { category: string; paid: number; consumed: number; refundable: number }[] | null) ?? [];

  const rows = lines
    .map(
      (l) =>
        `<tr><td>${esc(CAT_FR[l.category] ?? l.category)}</td><td style="text-align:right">${esc(money(l.paid))}</td><td style="text-align:right">${esc(money(l.consumed))}</td><td style="text-align:right;font-weight:600">${esc(money(l.refundable))}</td></tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    *{font-family:'Segoe UI',Tahoma,Arial,sans-serif;}
    body{margin:0;color:#1e293b;font-size:13px;line-height:1.7;}
    .head{text-align:center;border-bottom:2px solid #1A56DB;padding-bottom:12px;}
    .estab{font-size:18px;font-weight:700;color:#143fa6;}
    h1{font-size:20px;margin:18px 0 6px;text-align:center;letter-spacing:0.5px;}
    .body{margin:18px 6px;}
    .amount{font-size:22px;font-weight:700;color:#047857;margin:10px 0;}
    table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px;}
    th,td{padding:5px 6px;border-bottom:1px solid #e2e8f0;}
    th{text-align:left;color:#64748b;font-weight:600;}
    .meta{margin:8px 0;}
    .sign{margin-top:48px;display:flex;justify-content:space-between;}
    .foot{margin-top:32px;font-size:10px;color:#94a3b8;text-align:center;}
  </style></head><body>
    <div class="head"><div class="estab">${esc(tenant?.name ?? 'Établissement')}</div></div>
    <h1>REÇU DE REMBOURSEMENT</h1>
    <div class="body">
      <p>L'établissement <b>${esc(tenant?.name ?? '')}</b> atteste avoir remboursé à la famille de l'élève :</p>
      <p style="font-size:15px;"><b>${esc(s.lastName)} ${esc(s.firstName)}</b>${s.cin ? `, CIN ${esc(s.cin)}` : ''}</p>
      <p class="amount">Montant remboursé : ${esc(money(amount))}</p>
      <div class="meta">
        <div>Mode de remboursement : <b>${esc(METHOD_FR[refund.method ?? ''] ?? refund.method ?? '—')}</b></div>
        ${refund.reference ? `<div>Référence : <b>${esc(refund.reference)}</b></div>` : ''}
        <div>Date du remboursement : <b>${esc(paidAt)}</b></div>
      </div>
      ${rows ? `<table><thead><tr><th>Frais</th><th style="text-align:right">Payé</th><th style="text-align:right">Consommé</th><th style="text-align:right">Remboursé</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
      <p>Ce reçu est délivré à la suite de la radiation de l'élève en cours d'année, pour servir et valoir ce que de droit.</p>
    </div>
    <div class="sign"><span>Fait le ${esc(today)}</span><span>Signature et cachet</span></div>
    <div class="foot">${esc(tenant?.name ?? 'LeadSchool')} — Document généré le ${esc(today)}</div>
  </body></html>`;

  const pdf = await htmlToPdf(html);
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdfFilename(`recu-remboursement-${s.lastName}`)}.pdf"` },
  });
}
