import 'server-only';
import { withTenant, prismaAdmin } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';
import { getUnfilledSessionsForTeacher, type UnfilledSession } from '@/lib/lesson-book';

type TeacherDigest = {
  firstName: string;
  email: string;
  unfilled: UnfilledSession[];
};

/**
 * Relance les enseignants ayant des séances passées (sur `sinceDays` jours) au
 * cahier de texte non rempli. Un e-mail digest par enseignant. Best-effort :
 * un échec d'envoi n'interrompt pas les autres. À déclencher par un cron.
 */
export async function runCahierRemindersForTenant(
  tenantId: string,
  sinceDays = 7,
): Promise<{ teachers: number; sessions: number }> {
  const digests = await withTenant(tenantId, async (tx) => {
    const teachers = await tx.person.findMany({
      where: { type: 'TEACHER', deletedAt: null },
      select: {
        id: true,
        firstName: true,
        contacts: true,
        userPersons: { select: { user: { select: { email: true, disabledAt: true } } } },
      },
    });

    const out: TeacherDigest[] = [];
    for (const teacher of teachers) {
      const unfilled = await getUnfilledSessionsForTeacher(tx, teacher.id, sinceDays);
      if (unfilled.length === 0) continue;
      // Préférence : e-mail du compte portail actif, sinon contact de la fiche.
      const accountEmail = teacher.userPersons
        .map((up) => up.user)
        .find((u) => u && !u.disabledAt)?.email;
      const contactEmail = (teacher.contacts as { email?: string } | null)?.email;
      const email = accountEmail ?? contactEmail;
      if (!email) continue;
      out.push({ firstName: teacher.firstName, email, unfilled });
    }
    return out;
  });

  if (digests.length === 0) return { teachers: 0, sessions: 0 };

  const tenant = await prismaAdmin.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const lang = tenant.localeDefault === 'ar' ? 'ar' : 'fr';

  let sessions = 0;
  await Promise.all(
    digests.map((d) => {
      sessions += d.unfilled.length;
      const subject =
        lang === 'ar'
          ? `[${tenant.name}] تذكير : ${d.unfilled.length} حصة بدون دفتر النصوص`
          : `[${tenant.name}] Rappel : ${d.unfilled.length} séance(s) sans cahier de texte`;
      return safeSendEmail({
        to: d.email,
        subject,
        html: buildHtml(d, lang, tenant.name),
        text: buildText(d, lang, tenant.name),
      });
    }),
  );

  return { teachers: digests.length, sessions };
}

function fmtDate(iso: string, lang: 'fr' | 'ar'): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function buildHtml(d: TeacherDigest, lang: 'fr' | 'ar', tenantName: string): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const labels =
    lang === 'ar'
      ? {
          hello: `مرحباً ${d.firstName}،`,
          intro: 'الحصص التالية لم يُملأ دفتر نصوصها بعد :',
          subject: 'المادة',
          cls: 'القسم',
          date: 'التاريخ',
          hint: 'يُرجى ملء دفتر النصوص من فضائكم « دفتر النصوص ».',
        }
      : {
          hello: `Bonjour ${d.firstName},`,
          intro: 'Les séances suivantes n’ont pas encore de cahier de texte :',
          subject: 'Matière',
          cls: 'Classe',
          date: 'Date',
          hint: 'Merci de compléter le cahier depuis votre espace « Cahier de texte ».',
        };
  const rows = d.unfilled
    .map(
      (s) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${s.subject ?? '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${s.className}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${fmtDate(s.date, lang)} (${s.slotStart}–${s.slotEnd})</td>
        </tr>`,
    )
    .join('');
  return `<!doctype html>
<html dir="${dir}">
  <body style="font-family:system-ui,sans-serif;color:#111827;max-width:680px;margin:0 auto;padding:24px;">
    <h2 style="margin:0 0 16px 0;">Jawal</h2>
    <p>${labels.hello}</p>
    <p>${labels.intro}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#f1f5f9;text-align:${dir === 'rtl' ? 'right' : 'left'};">
          <th style="padding:8px;">${labels.subject}</th>
          <th style="padding:8px;">${labels.cls}</th>
          <th style="padding:8px;">${labels.date}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;color:#6b7280;font-size:13px;">${labels.hint}</p>
  </body>
</html>`;
}

function buildText(d: TeacherDigest, lang: 'fr' | 'ar', tenantName: string): string {
  const intro =
    lang === 'ar'
      ? `${tenantName} : ${d.unfilled.length} حصة بدون دفتر النصوص`
      : `${tenantName} : ${d.unfilled.length} séance(s) sans cahier de texte`;
  const lines = d.unfilled.map(
    (s) =>
      `- ${s.subject ?? '—'} · ${s.className} · ${fmtDate(s.date, lang)} (${s.slotStart}–${s.slotEnd})`,
  );
  return [intro, '', ...lines].join('\n');
}
