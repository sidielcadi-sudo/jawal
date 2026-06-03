import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant, prismaAdmin } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';
import { loadBulletinData } from '@/lib/bulletin-data';
import { renderBulletinDocument } from '@/lib/bulletin-html';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';

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
  const periodId = new URL(req.url).searchParams.get('period');
  if (!periodId) return new Response('period is required', { status: 400 });

  const tenantId = session.user.tenantId;
  const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return new Response('Tenant not found', { status: 404 });

  const data = await withTenant(tenantId, async (tx) => {
    if (!(await parentCanAccessChild(tx, session.user.id, childId))) return 'forbidden' as const;

    const activeYear = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    const sc = await tx.studentClass.findFirst({
      where: {
        studentId: childId,
        unenrolledAt: null,
        ...(activeYear ? { class: { academicYearId: activeYear.id } } : {}),
      },
      select: { classId: true },
    });
    if (!sc) return null;

    return loadBulletinData(tx, { classId: sc.classId, periodId, studentIds: [childId] });
  });

  if (data === 'forbidden') return new Response('Forbidden', { status: 403 });
  if (!data || data.students.length === 0) return new Response('Not found', { status: 404 });

  const locale = tenant.localeDefault;
  const t = await getTranslations({ locale, namespace: 'admin.bulletin' });
  const html = renderBulletinDocument(data, {
    tenantName: tenant.name,
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
