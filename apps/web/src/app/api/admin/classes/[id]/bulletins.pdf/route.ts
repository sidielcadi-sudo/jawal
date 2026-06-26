import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant, prismaAdmin } from '@/lib/db';
import { loadBulletinData } from '@/lib/bulletin-data';
import { renderBulletinDocument } from '@/lib/bulletin-html';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';
import { getTenantLogoDataUri } from '@/lib/tenant-logo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/classes/[id]/bulletins.pdf?period=…
 * Lot : un PDF unique avec le bulletin de chaque élève de la classe (1/page).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { id: classId } = await ctx.params;
  const periodId = new URL(req.url).searchParams.get('period');
  if (!periodId) return new Response('period is required', { status: 400 });

  const tenantId = session.user.tenantId;
  const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return new Response('Tenant not found', { status: 404 });

  const data = await withTenant(tenantId, (tx) =>
    loadBulletinData(tx, { classId, periodId }),
  );
  if (!data) return new Response('Not found', { status: 404 });
  if (data.students.length === 0) return new Response('No students in class', { status: 404 });

  const locale = tenant.localeDefault;
  const t = await getTranslations({ locale, namespace: 'admin.bulletin' });
  const html = renderBulletinDocument(data, {
    tenantName: tenant.name,
    logoDataUri: await getTenantLogoDataUri(tenantId),
    locale,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    t,
  });
  const pdf = await htmlToPdf(html);

  const filename = pdfFilename(`bulletins-${data.cls.name}-${data.period.label}`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`,
    },
  });
}
