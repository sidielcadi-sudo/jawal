import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Reçu de remboursement : exemplaires vendus & remboursés d'un vendeur. */
export async function GET(req: Request, ctx: { params: Promise<{ sellerId: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { sellerId } = await ctx.params;
  const campaignId = new URL(req.url).searchParams.get('campaign');
  if (!campaignId) return new Response('Campagne requise', { status: 400 });

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const seller = await tx.person.findUnique({ where: { id: sellerId }, select: { firstName: true, lastName: true } });
    const copies = await tx.bookCopy.findMany({ where: { sellerId, campaignId, status: 'REFUNDED' }, include: { book: { select: { title: true } } }, orderBy: { code: 'asc' } });
    const tenant = await tx.tenant.findFirst({ select: { name: true, currency: true } });
    const campaign = await tx.bookExchangeCampaign.findUnique({ where: { id: campaignId }, select: { label: true, year: true } });
    return { seller, copies, tenant, campaign };
  });
  if (!data.seller || data.copies.length === 0) return new Response('Not found', { status: 404 });
  const { seller, copies, tenant, campaign } = data;
  const cur = esc(tenant?.currency ?? 'MAD');
  const totalNet = copies.reduce((s, c) => s + ((c.salePrice ?? 0) - (c.commission ?? 0)), 0);
  const mode = copies[0]?.refundMode === 'FEE_CREDIT' ? 'Avoir sur scolarité' : 'Espèces';
  const today = new Date().toLocaleDateString('fr-FR');

  const rows = copies
    .map((c) => `<tr><td>${esc(c.code)}</td><td>${esc(c.book.title)}</td><td class="num">${(c.salePrice ?? 0).toFixed(2)}</td><td class="num">${(c.commission ?? 0).toFixed(2)}</td><td class="num">${((c.salePrice ?? 0) - (c.commission ?? 0)).toFixed(2)} ${cur}</td></tr>`)
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    *{font-family:'Segoe UI',Tahoma,Arial,sans-serif;}
    body{margin:0;color:#1e293b;font-size:12px;}
    .head{display:flex;justify-content:space-between;border-bottom:2px solid #1A56DB;padding-bottom:10px;}
    .estab{font-size:16px;font-weight:700;color:#143fa6;}
    h1{font-size:18px;margin:4px 0 0;}
    .meta{margin-top:10px;color:#475569;}
    table{width:100%;border-collapse:collapse;margin-top:14px;}
    th{background:#f1f5f9;text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;color:#64748b;}
    td{padding:6px 8px;border-bottom:1px solid #eef2f7;}
    .num{text-align:right;font-variant-numeric:tabular-nums;}
    .total{margin-top:14px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;}
    .total .l{font-weight:700;color:#065f46;} .total .v{font-size:20px;font-weight:800;color:#065f46;}
    .foot{margin-top:24px;font-size:10px;color:#94a3b8;text-align:center;}
  </style></head><body>
    <div class="head"><div><div class="estab">${esc(tenant?.name ?? 'Bourse aux livres')}</div><h1>Reçu de remboursement — bourse aux livres</h1></div><div style="text-align:right;color:#475569;">${campaign ? esc(`${campaign.label} ${campaign.year}`) : ''}<br/>${today}</div></div>
    <div class="meta"><b>Vendeur :</b> ${esc(seller.lastName)} ${esc(seller.firstName)} &nbsp;·&nbsp; <b>Mode :</b> ${mode}</div>
    <table>
      <thead><tr><th>Code</th><th>Titre</th><th class="num">Vendu</th><th class="num">Commission</th><th class="num">Net vendeur</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total"><span class="l">Total remboursé</span><span class="v">${totalNet.toFixed(2)} ${cur}</span></div>
    <div class="foot">${esc(tenant?.name ?? 'Jawal')} — Reçu généré le ${today}</div>
  </body></html>`;

  const pdf = await htmlToPdf(html);
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdfFilename(`recu-remboursement-${seller.lastName}`)}.pdf"` },
  });
}
