import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant, prismaAdmin } from '@/lib/db';
import { getStudentPersonId } from '@/lib/student';
import { loadBulletinData } from '@/lib/bulletin-data';
import { renderBulletinDocument } from '@/lib/bulletin-html';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';
import { getTenantLogoDataUri } from '@/lib/tenant-logo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/eleve/bulletin.pdf?period=…
 * Bulletin PDF de l'élève connecté (résolu via son compte) — affiché en ligne
 * dans le portail élève.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  if (!session.user.isStudent) return new Response('Forbidden', { status: 403 });

  const periodId = new URL(req.url).searchParams.get('period');
  if (!periodId) return new Response('period is required', { status: 400 });

  const tenantId = session.user.tenantId;
  const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return new Response('Tenant not found', { status: 404 });

  const data = await withTenant(tenantId, async (tx) => {
    const studentId = await getStudentPersonId(tx, session.user.id);
    if (!studentId) return null;

    // Résout la classe via l'année de la période demandée (support multi-années).
    const period = await tx.period.findUnique({
      where: { id: periodId },
      select: { academicYearId: true },
    });
    if (!period) return null;
    const sc = await tx.studentClass.findFirst({
      where: { studentId, unenrolledAt: null, class: { academicYearId: period.academicYearId } },
      select: { classId: true },
    });
    if (!sc) return null;

    return loadBulletinData(tx, { classId: sc.classId, periodId, studentIds: [studentId] });
  });

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
      'Content-Disposition': `inline; filename="${filename}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`,
    },
  });
}
