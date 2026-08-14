import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testAdmin } from './setup';
import { createTestTenant, mockNextEnv } from './helpers';

/**
 * Soutien scolaire — garde d'accès du portail enseignant.
 *
 * Les actions pédagogiques sont ouvertes à l'enseignant **titulaire** du cours
 * en plus de l'équipe encadrante ; le cadre (affectation d'élèves, tarif)
 * reste administratif. C'est le point le plus sensible du module : un défaut
 * ici laisserait un prof saisir l'appel du cours d'un collègue.
 */
describe('Soutien scolaire — garde des actions pédagogiques', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;
  let courseId: string;
  let sessionId: string;
  let ownerUserId: string;
  let otherTeacherUserId: string;
  let studentId: string;

  beforeEach(async () => {
    vi.resetModules();
    tenant = await createTestTenant();

    const subject = await testAdmin.subject.create({
      data: { tenantId: tenant.tenantId, code: 'math', label: 'Mathématiques' },
    });

    // Deux enseignants, chacun avec son compte utilisateur lié.
    const mkTeacher = async (name: string) => {
      const person = await testAdmin.person.create({
        data: { tenantId: tenant.tenantId, type: 'TEACHER', firstName: name, lastName: 'Prof' },
      });
      const user = await testAdmin.user.create({
        data: { tenantId: tenant.tenantId, email: `${name}@test.ma`, passwordHash: 'x' },
      });
      await testAdmin.userPerson.create({
        data: {
          tenantId: tenant.tenantId,
          userId: user.id,
          personId: person.id,
          relationship: 'self',
        },
      });
      return { personId: person.id, userId: user.id };
    };
    const owner = await mkTeacher('Amina');
    const other = await mkTeacher('Karim');
    ownerUserId = owner.userId;
    otherTeacherUserId = other.userId;

    const course = await testAdmin.supportCourse.create({
      data: {
        tenantId: tenant.tenantId,
        academicYearId: tenant.yearId,
        subjectId: subject.id,
        teacherId: owner.personId,
        title: 'Soutien Maths',
        pricingMode: 'FREE',
      },
    });
    courseId = course.id;

    const student = await testAdmin.person.create({
      data: { tenantId: tenant.tenantId, type: 'STUDENT', firstName: 'Yassine', lastName: 'Benani' },
    });
    studentId = student.id;
    await testAdmin.supportEnrollment.create({
      data: { tenantId: tenant.tenantId, supportCourseId: course.id, studentId: student.id },
    });

    const sess = await testAdmin.supportSession.create({
      data: {
        tenantId: tenant.tenantId,
        supportCourseId: course.id,
        date: new Date('2026-01-15T00:00:00.000Z'),
      },
    });
    sessionId = sess.id;
  });

  const attendance = () => [{ studentId, present: false, appreciation: 'Absent justifié' }];

  it('le prof titulaire peut saisir l’appel de son cours', async () => {
    mockNextEnv({
      userId: ownerUserId,
      tenantId: tenant.tenantId,
      email: 'Amina@test.ma',
      roleCodes: ['enseignant'],
    });
    const { saveSupportAttendanceAction } = await import('@/app/[locale]/admin/soutien/actions');

    const r = await saveSupportAttendanceAction(sessionId, attendance());
    expect(r.ok).toBe(true);

    const saved = await testAdmin.supportAttendance.findFirst({ where: { sessionId } });
    expect(saved?.present).toBe(false);
    expect(saved?.appreciation).toBe('Absent justifié');
  });

  it('un autre enseignant est refusé sur le même cours', async () => {
    mockNextEnv({
      userId: otherTeacherUserId,
      tenantId: tenant.tenantId,
      email: 'Karim@test.ma',
      roleCodes: ['enseignant'],
    });
    const { saveSupportAttendanceAction } = await import('@/app/[locale]/admin/soutien/actions');

    const r = await saveSupportAttendanceAction(sessionId, attendance());
    expect(r.ok).toBe(false);
    expect(await testAdmin.supportAttendance.count({ where: { sessionId } })).toBe(0);
  });

  it('l’équipe encadrante reste autorisée', async () => {
    mockNextEnv({
      userId: tenant.userId,
      tenantId: tenant.tenantId,
      email: tenant.email,
      roleCodes: ['tenant_admin'],
    });
    const { saveSupportAttendanceAction } = await import('@/app/[locale]/admin/soutien/actions');

    const r = await saveSupportAttendanceAction(sessionId, attendance());
    expect(r.ok).toBe(true);
  });

  it('un autre enseignant ne peut pas créer de séance sur ce cours', async () => {
    mockNextEnv({
      userId: otherTeacherUserId,
      tenantId: tenant.tenantId,
      email: 'Karim@test.ma',
      roleCodes: ['enseignant'],
    });
    const { createSupportSessionAction } = await import('@/app/[locale]/admin/soutien/actions');

    const fd = new FormData();
    fd.set('date', '2026-02-02');
    const r = await createSupportSessionAction(courseId, fd);
    expect(r.ok).toBe(false);
    expect(await testAdmin.supportSession.count({ where: { supportCourseId: courseId } })).toBe(1);
  });

  it('le cadre reste administratif : un prof ne peut pas inscrire un élève', async () => {
    const newStudent = await testAdmin.person.create({
      data: { tenantId: tenant.tenantId, type: 'STUDENT', firstName: 'Sara', lastName: 'Alaoui' },
    });
    mockNextEnv({
      userId: ownerUserId,
      tenantId: tenant.tenantId,
      email: 'Amina@test.ma',
      roleCodes: ['enseignant'],
    });
    const { enrollSupportStudentAction } = await import('@/app/[locale]/admin/soutien/actions');

    // La garde stricte lève (requireRoleCode) au lieu de renvoyer un résultat.
    await expect(
      enrollSupportStudentAction(courseId, newStudent.id, false),
    ).rejects.toThrow(/Forbidden/);
    expect(await testAdmin.supportEnrollment.count({ where: { supportCourseId: courseId } })).toBe(1);
  });
});
