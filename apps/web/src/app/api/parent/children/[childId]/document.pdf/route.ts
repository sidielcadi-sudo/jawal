import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant, prismaAdmin } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';
import { DOCUMENT_TYPES, loadDocumentData, type DocumentType } from '@/lib/document-data';
import { renderDocumentHTML } from '@/lib/document-html';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/parent/children/[childId]/document.pdf?type=…&year=…&period=…
 * Document officiel d'un enfant, accessible au parent (contrôle de propriété).
 */
export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  if (!session.user.isParent) return new Response('Forbidden', { status: 403 });

  const { childId } = await ctx.params;
  const url = new URL(req.url);
  const type = url.searchParams.get('type') as DocumentType | null;
  const yearId = url.searchParams.get('year') ?? undefined;
  const periodId = url.searchParams.get('period') ?? undefined;
  if (!type || !DOCUMENT_TYPES.includes(type)) {
    return new Response('Unknown document type', { status: 400 });
  }

  const tenantId = session.user.tenantId;
  const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return new Response('Tenant not found', { status: 404 });

  const data = await withTenant(tenantId, async (tx) => {
    if (!(await parentCanAccessChild(tx, session.user.id, childId))) return 'forbidden' as const;
    return loadDocumentData(tx, { studentId: childId, type, yearId, periodId });
  });
  if (data === 'forbidden') return new Response('Forbidden', { status: 403 });
  if (!data) return new Response('Données indisponibles pour ce document.', { status: 422 });

  const locale = tenant.localeDefault;
  const t = await getTranslations({ locale, namespace: 'admin.documents' });
  const refId = randomUUID().slice(0, 8).toUpperCase();
  const html = renderDocumentHTML(data, {
    tenantName: tenant.name,
    locale,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    currency: tenant.currency,
    refId,
    t,
  });
  const pdf = await htmlToPdf(html);

  const filename = pdfFilename(`${type}-${data.student.lastName}-${data.student.firstName}`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`,
    },
  });
}
