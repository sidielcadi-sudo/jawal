import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHOD_FR: Record<string, string> = { CASH: 'Espèces', CHEQUE: 'Chèque', TRANSFER: 'Virement', CMI: 'Carte (CMI)' };
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Reçu d'achat d'un exemplaire vendu. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id } = await ctx.params;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const copy = await tx.bookCopy.findUnique({
      where: { id },
      include: { book: { select: { title: true } }, buyer: { select: { firstName: true, lastName: true } } },
    });
    const sale = await tx.bookTransaction.findFirst({ where: { copyId: id, type: 'SALE' }, orderBy: { createdAt: 'desc' } });
    const tenant = await tx.tenant.findFirst({ select: { name: true, currency: true } });
    return { copy, sale, tenant };
  });
  if (!data.copy || data.copy.status !== 'SOLD') return new Response('Not found', { status: 404 });
  const { copy, sale, tenant } = data;
  const cur = esc(tenant?.currency ?? 'MAD');
  const date = (copy.soldAt ?? new Date()).toLocaleDateString('fr-FR');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    *{font-family:'Segoe UI',Tahoma,Arial,sans-serif;}
    body{margin:0;color:#1e293b;font-size:13px;}
    .head{display:flex;justify-content:space-between;border-bottom:2px solid #1A56DB;padding-bottom:10px;}
    .estab{font-size:16px;font-weight:700;color:#143fa6;}
    h1{font-size:18px;margin:4px 0 0;}
    .body{margin-top:16px;}
    .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eef2f7;}
    .lbl{color:#64748b;}
    .total{margin-top:14px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;}
    .total .l{font-weight:700;color:#065f46;}
    .total .v{font-size:20px;font-weight:800;color:#065f46;}
    .foot{margin-top:24px;font-size:10px;color:#94a3b8;text-align:center;}
  </style></head><body>
    <div class="head"><div><div class="estab">${esc(tenant?.name ?? 'Bourse aux livres')}</div><h1>Reçu d'achat — bourse aux livres</h1></div><div style="text-align:right;color:#475569;">${date}</div></div>
    <div class="body">
      <div class="row"><span class="lbl">Code</span><span>${esc(copy.code)}</span></div>
      <div class="row"><span class="lbl">Manuel</span><span>${esc(copy.book.title)}</span></div>
      ${copy.buyer ? `<div class="row"><span class="lbl">Acheteur</span><span>${esc(copy.buyer.lastName)} ${esc(copy.buyer.firstName)}</span></div>` : ''}
      <div class="row"><span class="lbl">Mode de paiement</span><span>${sale ? METHOD_FR[sale.method ?? ''] ?? sale.method : '—'}</span></div>
    </div>
    <div class="total"><span class="l">Montant payé</span><span class="v">${(copy.salePrice ?? copy.askPrice).toFixed(2)} ${cur}</span></div>
    <div class="foot">${esc(tenant?.name ?? 'LeadSchool')} — Reçu généré le ${date}</div>
  </body></html>`;

  const pdf = await htmlToPdf(html);
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdfFilename(`recu-achat-${copy.code}`)}.pdf"` },
  });
}
