import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COND_FR: Record<string, string> = { NEW: 'Neuf', VERY_GOOD: 'Très bon', GOOD: 'Bon', FAIR: 'Moyen' };
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Reçu de dépôt : tous les exemplaires déposés par un élève dans une campagne. */
export async function GET(req: Request, ctx: { params: Promise<{ sellerId: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { sellerId } = await ctx.params;
  const campaignId = new URL(req.url).searchParams.get('campaign');
  if (!campaignId) return new Response('Campagne requise', { status: 400 });

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const seller = await tx.person.findUnique({ where: { id: sellerId }, select: { firstName: true, lastName: true } });
    const copies = await tx.bookCopy.findMany({
      where: { sellerId, campaignId, status: { in: ['FOR_SALE', 'RESERVED', 'SOLD', 'WITHDRAWN', 'REFUNDED'] } },
      include: { book: { select: { title: true } } },
      orderBy: { code: 'asc' },
    });
    const tenant = await tx.tenant.findFirst({ select: { name: true, currency: true } });
    const campaign = await tx.bookExchangeCampaign.findUnique({ where: { id: campaignId }, select: { label: true, year: true } });
    return { seller, copies, tenant, campaign };
  });
  if (!data.seller) return new Response('Not found', { status: 404 });
  const { seller, copies, tenant, campaign } = data;
  const cur = esc(tenant?.currency ?? 'MAD');
  const total = copies.reduce((s, c) => s + c.askPrice, 0);
  const today = new Date().toLocaleDateString('fr-FR');

  const rows = copies
    .map((c) => `<tr><td>${esc(c.code)}</td><td>${esc(c.book.title)}</td><td>${COND_FR[c.condition] ?? c.condition}</td><td class="num">${c.askPrice.toFixed(2)} ${cur}</td></tr>`)
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
    .total{margin-top:12px;text-align:right;font-size:14px;font-weight:700;}
    .foot{margin-top:24px;font-size:10px;color:#94a3b8;text-align:center;}
  </style></head><body>
    <div class="head">
      <div><div class="estab">${esc(tenant?.name ?? 'Bourse aux livres')}</div><h1>Reçu de dépôt — bourse aux livres</h1></div>
      <div style="text-align:right;color:#475569;">${campaign ? esc(`${campaign.label} ${campaign.year}`) : ''}<br/>${today}</div>
    </div>
    <div class="meta"><b>Déposant :</b> ${esc(seller.lastName)} ${esc(seller.firstName)} &nbsp;·&nbsp; <b>${copies.length}</b> exemplaire(s)</div>
    <table>
      <thead><tr><th>Code</th><th>Titre</th><th>État</th><th class="num">Prix bourse</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total">Valeur estimée : ${total.toFixed(2)} ${cur}</div>
    <p style="margin-top:8px;font-size:11px;color:#64748b;">Le montant remboursé dépendra des exemplaires effectivement vendus, déduction faite de l'éventuelle commission.</p>
    <div class="foot">${esc(tenant?.name ?? 'LeadSchool')} — Reçu généré le ${today}</div>
  </body></html>`;

  const pdf = await htmlToPdf(html);
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdfFilename(`recu-depot-${seller.lastName}`)}.pdf"` },
  });
}
