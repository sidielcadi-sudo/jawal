import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';
import { renderRadiationCertificate } from '@/lib/radiation-certificate-html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id } = await ctx.params;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const req = await tx.radiationRequest.findUnique({
      where: { id },
      include: {
        student: { select: { firstName: true, lastName: true, birthDate: true, cin: true } },
        enrollment: { include: { level: { select: { label: true } }, academicYear: { select: { label: true } } } },
      },
    });
    const tenant = await tx.tenant.findFirst({ select: { name: true } });
    return { req, tenant };
  });
  if (!data.req || data.req.status !== 'APPROVED') return new Response('Certificat indisponible (demande non approuvée).', { status: 404 });
  const { req, tenant } = data;
  const s = req.student;

  const html = renderRadiationCertificate({
    tenantName: tenant?.name ?? 'Établissement',
    type: req.type,
    destinationSchool: req.destinationSchool,
    approvedAt: req.approvedAt,
    debtCleared: req.debtCleared,
    student: s,
    levelLabel: req.enrollment.level.label,
    yearLabel: req.enrollment.academicYear.label,
  });

  const pdf = await htmlToPdf(html);
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdfFilename(`certificat-radiation-${s.lastName}`)}.pdf"` },
  });
}
