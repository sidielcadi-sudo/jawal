import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant, prismaAdmin } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';
import { loadBulletinData } from '@/lib/bulletin-data';
import { renderBulletinDocument } from '@/lib/bulletin-html';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';
import { getTenantLogoDataUri } from '@/lib/tenant-logo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/parent/children/[childId]/bulletin.pdf?period=…
 * Bulletin PDF d'un enfant, accessible au parent — avec contrôle de propriété
 * (l'enfant doit faire partie des enfants rattachés au compte).
 */
export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  if (!session.user.isParent) return new Response('Forbidden', { status: 403 });

  const { childId } = await ctx.params;
  const url = new URL(req.url);
  let periodId = url.searchParams.get('period');
  const yearId = url.searchParams.get('year');
  if (!periodId && !yearId) return new Response('period or year is required', { status: 400 });

  const tenantId = session.user.tenantId;
  const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return new Response('Tenant not found', { status: 404 });

  const data = await withTenant(tenantId, async (tx) => {
    if (!(await parentCanAccessChild(tx, session.user.id, childId))) return 'forbidden' as const;

    // À défaut de période, prend la dernière période de l'année demandée.
    if (!periodId && yearId) {
      const latest = await tx.period.findFirst({
        where: { academicYearId: yearId },
        orderBy: [{ startDate: 'desc' }],
        select: { id: true },
      });
      if (!latest) return null;
      periodId = latest.id;
    }

    // Résout la classe via l'année de la période demandée (support multi-années).
    const period = await tx.period.findUnique({
      where: { id: periodId! },
      select: { academicYearId: true },
    });
    if (!period) return null;
    const sc = await tx.studentClass.findFirst({
      where: {
        studentId: childId,
        unenrolledAt: null,
        class: { academicYearId: period.academicYearId },
      },
      select: { classId: true },
    });
    if (!sc) return null;

    return loadBulletinData(tx, { classId: sc.classId, periodId: periodId!, studentIds: [childId] });
  });

  if (data === 'forbidden') return new Response('Forbidden', { status: 403 });
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
