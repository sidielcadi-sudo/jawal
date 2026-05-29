import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { csvResponse, toCSV } from '@/lib/csv-export';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const rows = await withTenant(session.user.tenantId, async (tx) => {
    const persons = await tx.person.findMany({
      where: { type: 'STUDENT', deletedAt: null },
      include: {
        studentClasses: {
          where: { unenrolledAt: null },
          include: { class: { include: { level: { include: { cycle: true } } } } },
          take: 1,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return persons.map((p) => {
      const contacts = (p.contacts ?? {}) as { email?: string; phone?: string };
      const cls = p.studentClasses[0]?.class;
      return {
        lastName: p.lastName,
        firstName: p.firstName,
        cin: p.cin ?? '',
        birthDate: p.birthDate ? p.birthDate.toISOString().slice(0, 10) : '',
        gender: p.gender ?? '',
        email: contacts.email ?? '',
        phone: contacts.phone ?? '',
        className: cls?.name ?? '',
        levelLabel: cls?.level.label ?? '',
        cycleLabel: cls?.level.cycle.label ?? '',
      };
    });
  });

  const csv = toCSV(rows, [
    { key: 'lastName', label: 'Nom' },
    { key: 'firstName', label: 'Prénom' },
    { key: 'cin', label: 'CIN' },
    { key: 'birthDate', label: 'Date de naissance' },
    { key: 'gender', label: 'Genre' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Téléphone' },
    { key: 'className', label: 'Classe' },
    { key: 'levelLabel', label: 'Niveau' },
    { key: 'cycleLabel', label: 'Cycle' },
  ]);

  return csvResponse(csv, `eleves-${new Date().toISOString().slice(0, 10)}.csv`);
}
