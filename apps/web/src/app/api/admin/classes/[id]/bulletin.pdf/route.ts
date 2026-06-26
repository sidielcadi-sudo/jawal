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
 * GET /api/admin/classes/[id]/bulletin.pdf?studentId=…&period=…
 * Bulletin officiel d'un élève en PDF (rendu Chromium du HTML autonome).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { id: classId } = await ctx.params;
  const url = new URL(req.url);
  const studentId = url.searchParams.get('studentId');
  const periodId = url.searchParams.get('period');
  if (!studentId || !periodId) {
    return new Response('studentId and period are required', { status: 400 });
  }

  const tenantId = session.user.tenantId;
  const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return new Response('Tenant not found', { status: 404 });

  const data = await withTenant(tenantId, (tx) =>
    loadBulletinData(tx, { classId, periodId, studentIds: [studentId] }),
  );
  if (!data || data.students.length === 0) return new Response('Not found', { status: 404 });

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

  const s = data.students[0]!.student;
  const filename = pdfFilename(`bulletin-${s.lastName}-${s.firstName}-${data.period.label}`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`,
    },
  });
}
