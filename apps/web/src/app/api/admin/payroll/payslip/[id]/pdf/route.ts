import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';
import { buildPayslipHtml, type PayslipPdfData } from '@/lib/payslip-html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MONTHS_FR = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MONTHS_AR = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'];

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const locale = url.searchParams.get('lang') === 'ar' ? 'ar' : 'fr';
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const slip = await tx.payslip.findUnique({
      where: { id },
      include: {
        run: { select: { year: true, month: true } },
        person: { select: { firstName: true, lastName: true, cin: true, payrollProfile: { select: { cnssNumber: true, baseSalary: true, transportAllowance: true, housingAllowance: true, benefitsInKind: true } } } },
      },
    });
    const tenant = await tx.tenant.findFirst({ select: { name: true, currency: true } });
    return { slip, tenant };
  });

  if (!data.slip) return new Response('Not found', { status: 404 });
  const { slip, tenant } = data;
  const b = slip.breakdown as Record<string, number>;
  const p = slip.person.payrollProfile;
  const months = locale === 'ar' ? MONTHS_AR : MONTHS_FR;

  const pdfData: PayslipPdfData = {
    tenantName: tenant?.name ?? 'LeadSchool',
    currency: tenant?.currency ?? 'MAD',
    period: `${months[slip.run.month]} ${slip.run.year}`,
    employee: { name: `${slip.person.lastName} ${slip.person.firstName}`, cin: slip.person.cin, cnss: p?.cnssNumber ?? null },
    gains: {
      baseSalary: p?.baseSalary ?? 0,
      seniorityBonus: b.seniorityBonus ?? 0,
      transport: p?.transportAllowance ?? 0,
      housing: p?.housingAllowance ?? 0,
      benefits: p?.benefitsInKind ?? 0,
      overtime: b.overtimeAmount ?? 0,
    },
    brut: slip.brut,
    retenues: { cnss: b.cnss ?? 0, amo: b.amo ?? 0, cimr: b.cimr ?? 0, ir: slip.irNet, internal: b.internalDeductions ?? 0 },
    netImposable: slip.netImposable,
    netPayable: slip.netPayable,
    employer: { cnss: b.cnssEmployer ?? 0, family: b.familyAllowance ?? 0, amo: b.amoEmployer ?? 0, training: b.trainingTax ?? 0, total: slip.employerCost },
  };

  const pdf = await htmlToPdf(buildPayslipHtml(pdfData, locale));
  const filename = pdfFilename(`bulletin-${slip.run.year}-${String(slip.run.month).padStart(2, '0')}-${slip.person.lastName}`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`,
    },
  });
}
