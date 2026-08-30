import { auth } from '@/lib/auth';
import { withTenant, prismaAdmin } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';
import { renderRadiationCertificate } from '@/lib/radiation-certificate-html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/parent/children/[childId]/radiation-certificate.pdf
 * Certificat de radiation de l'enfant, accessible au parent une fois la
 * radiation approuvée (contrôle de propriété).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  if (!session.user.isParent) return new Response('Forbidden', { status: 403 });

  const { childId } = await ctx.params;
  const tenantId = session.user.tenantId;
  const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

  const req = await withTenant(tenantId, async (tx) => {
    if (!(await parentCanAccessChild(tx, session.user.id, childId))) return 'forbidden' as const;
    return tx.radiationRequest.findFirst({
      where: { studentId: childId, status: 'APPROVED' },
      orderBy: { approvedAt: 'desc' },
      include: {
        student: { select: { firstName: true, lastName: true, birthDate: true, cin: true } },
        enrollment: { include: { level: { select: { label: true, labelAr: true } }, academicYear: { select: { label: true } } } },
      },
    });
  });
  if (req === 'forbidden') return new Response('Forbidden', { status: 403 });
  if (!req) return new Response('Certificat indisponible.', { status: 404 });

  const html = renderRadiationCertificate({
    tenantName: tenant?.name ?? 'Établissement',
    type: req.type,
    destinationSchool: req.destinationSchool,
    approvedAt: req.approvedAt,
    debtCleared: req.debtCleared,
    student: req.student,
    levelLabel: req.enrollment.level.label,
    yearLabel: req.enrollment.academicYear.label,
  });
  const pdf = await htmlToPdf(html);
  const s = req.student;
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdfFilename(`certificat-radiation-${s.lastName}`)}.pdf"`,
    },
  });
}
