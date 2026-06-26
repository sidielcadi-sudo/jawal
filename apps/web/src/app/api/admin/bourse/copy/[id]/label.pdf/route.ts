import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COND_FR: Record<string, string> = { NEW: 'Neuf', VERY_GOOD: 'Très bon', GOOD: 'Bon', FAIR: 'Moyen' };
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id } = await ctx.params;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const copy = await tx.bookCopy.findUnique({ where: { id }, include: { book: { select: { title: true, level: { select: { code: true } } } } } });
    const tenant = await tx.tenant.findFirst({ select: { name: true, currency: true } });
    return { copy, tenant };
  });
  if (!data.copy) return new Response('Not found', { status: 404 });
  const { copy, tenant } = data;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    *{font-family:'Segoe UI',Tahoma,Arial,sans-serif;}
    body{margin:0;}
    .label{width:300px;border:2px solid #1A56DB;border-radius:10px;padding:14px;margin:0 auto;text-align:center;}
    .estab{font-size:11px;color:#64748b;}
    .code{font-size:24px;font-weight:800;letter-spacing:2px;color:#143fa6;margin:6px 0;font-family:monospace;}
    .title{font-size:14px;font-weight:600;color:#1e293b;}
    .meta{margin-top:6px;font-size:12px;color:#475569;}
    .price{margin-top:8px;font-size:20px;font-weight:800;color:#065f46;}
  </style></head><body>
    <div class="label">
      <div class="estab">${esc(tenant?.name ?? 'Bourse aux livres')}</div>
      <div class="code">${esc(copy.code)}</div>
      <div class="title">${esc(copy.book.title)}</div>
      <div class="meta">${copy.book.level?.code ? esc(copy.book.level.code) + ' · ' : ''}${COND_FR[copy.condition] ?? copy.condition}</div>
      <div class="price">${copy.askPrice.toFixed(2)} ${esc(tenant?.currency ?? 'MAD')}</div>
    </div>
  </body></html>`;

  const pdf = await htmlToPdf(html);
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdfFilename(`etiquette-${copy.code}`)}.pdf"` },
  });
}
