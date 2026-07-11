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
 * GET /api/admin/persons/[id]/bulletin.pdf?year=…|period=…
 * Relevé des notes (bulletin) d'un élève, côté admin. Utilisé notamment comme
 * pièce du dossier de radiation (« Relevé des notes »). À défaut de `period`,
 * on prend la dernière période de l'année `year`.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { id: studentId } = await ctx.params;
  const url = new URL(req.url);
  const yearId = url.searchParams.get('year');
  let periodId = url.searchParams.get('period');

  const tenantId = session.user.tenantId;
  const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return new Response('Tenant not found', { status: 404 });

  const data = await withTenant(tenantId, async (tx) => {
    // Résout la période : celle demandée, sinon la dernière de l'année.
    if (!periodId) {
      if (!yearId) return null;
      const period = await tx.period.findFirst({
        where: { academicYearId: yearId },
        orderBy: [{ startDate: 'desc' }],
        select: { id: true },
      });
      if (!period) return null;
      periodId = period.id;
    }
    const period = await tx.period.findUnique({ where: { id: periodId }, select: { academicYearId: true } });
    if (!period) return null;
    const sc = await tx.studentClass.findFirst({
      where: { studentId, class: { academicYearId: period.academicYearId } },
      orderBy: { unenrolledAt: { sort: 'desc', nulls: 'first' } },
      select: { classId: true },
    });
    if (!sc) return null;
    return loadBulletinData(tx, { classId: sc.classId, periodId, studentIds: [studentId] });
  });

  if (!data || data.students.length === 0) {
    return new Response('Relevé indisponible (aucune note pour cette période).', { status: 404 });
  }

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
  const filename = pdfFilename(`releve-notes-${s.lastName}-${s.firstName}`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`,
    },
  });
}
