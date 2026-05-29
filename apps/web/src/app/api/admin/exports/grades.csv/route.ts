import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { csvResponse, toCSV } from '@/lib/csv-export';
import { computeClassBook } from '@/lib/grades';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const classId = url.searchParams.get('classId');
  const periodId = url.searchParams.get('periodId');
  if (!classId || !periodId) {
    return new Response('classId and periodId required', { status: 400 });
  }

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          where: { unenrolledAt: null },
          include: { student: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!cls) return null;
    const subjects = await tx.subject.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }] });
    const book = await computeClassBook(tx, {
      classId,
      periodId,
      students: cls.students.map((sc) => ({
        id: sc.student.id,
        firstName: sc.student.firstName,
        lastName: sc.student.lastName,
      })),
      allSubjects: subjects.map((s) => ({
        id: s.id,
        label: s.label,
        scale: s.scale,
        coefficient: s.coefficient,
        order: s.order,
      })),
    });
    return { cls, subjects, book };
  });
  if (!data) return new Response('Class not found', { status: 404 });

  // Construire dynamiquement les colonnes : Nom, Prénom, subj1, subj2, …, Générale, Rang
  const subjectCols = data.subjects.map((s) => ({
    key: `subj_${s.id}` as const,
    label: s.label,
  }));
  type Row = Record<string, string | number>;
  const rows: Row[] = data.book.rows.map((r) => {
    const row: Row = {
      lastName: r.lastName,
      firstName: r.firstName,
    };
    for (const s of r.subjects) {
      row[`subj_${s.subjectId}`] = s.average !== null ? s.average.toFixed(2) : '';
    }
    row['general'] = r.generalAverage !== null ? r.generalAverage.toFixed(2) : '';
    row['rank'] = r.generalRank !== null ? `${r.generalRank}/${r.ratedStudents}` : '';
    return row;
  });

  const csv = toCSV(rows, [
    { key: 'lastName', label: 'Nom' },
    { key: 'firstName', label: 'Prénom' },
    ...subjectCols,
    { key: 'general', label: 'Moyenne générale' },
    { key: 'rank', label: 'Rang' },
  ]);

  return csvResponse(csv, `notes-${data.cls.name}-${new Date().toISOString().slice(0, 10)}.csv`);
}
