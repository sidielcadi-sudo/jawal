import 'server-only';
import type { ContractType } from '@jawal/db';
import { withTenant, prismaAdmin } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';
import { computeContractStatus, ALERT_THRESHOLDS_DAYS } from '@/lib/contract-status';
import type { BilingualNameFields } from '@/lib/localized-name';

export type ContractAlert = BilingualNameFields & {
  personId: string;
  type: 'TEACHER' | 'STAFF';
  contractType: ContractType | null;
  endDate: Date;
  daysToEnd: number;
  bucket: 'EXPIRES_30' | 'EXPIRES_7' | 'EXPIRED';
};

/// Liste les contrats nécessitant une alerte pour un tenant donné.
/// Inclut les statuts EXPIRES_30, EXPIRES_7 et EXPIRED (utile au widget).
export async function listContractAlerts(tenantId: string): Promise<ContractAlert[]> {
  const persons = await withTenant(tenantId, (tx) =>
    tx.person.findMany({
      where: {
        type: { in: ['TEACHER', 'STAFF'] },
        deletedAt: null,
        contractEndDate: { not: null },
      },
      orderBy: [{ contractEndDate: 'asc' }],
    }),
  );

  const now = new Date();
  return persons
    .map((p) => {
      const { status, daysToEnd } = computeContractStatus(p, now);
      if (status !== 'EXPIRES_30' && status !== 'EXPIRES_7' && status !== 'EXPIRED') return null;
      return {
        personId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        firstNameAr: p.firstNameAr,
        lastNameAr: p.lastNameAr,
        type: p.type as 'TEACHER' | 'STAFF',
        contractType: p.contractType,
        endDate: p.contractEndDate!,
        daysToEnd: daysToEnd ?? 0,
        bucket: status as ContractAlert['bucket'],
      };
    })
    .filter((x): x is ContractAlert => x !== null);
}

/// Envoie un email digest aux destinataires : admins tenant + direction.
/// Idempotent : on n'inclut que les alertes pile aux seuils ALERT_THRESHOLDS_DAYS
/// (30 et 7 jours) pour ne pas spammer chaque jour entre les seuils.
export async function runContractAlertsForTenant(tenantId: string): Promise<{
  recipients: number;
  alerts: number;
}> {
  const allAlerts = await listContractAlerts(tenantId);
  const toNotify = allAlerts.filter((a) =>
    (ALERT_THRESHOLDS_DAYS as readonly number[]).includes(a.daysToEnd),
  );
  if (toNotify.length === 0) return { recipients: 0, alerts: 0 };

  // Destinataires : utilisateurs ayant un rôle tenant_admin ou direction
  const recipients = await prismaAdmin.user.findMany({
    where: {
      tenantId,
      disabledAt: null,
      userRoles: {
        some: { role: { code: { in: ['tenant_admin', 'direction'] } } },
      },
    },
    select: { email: true },
  });
  if (recipients.length === 0) return { recipients: 0, alerts: toNotify.length };

  const tenant = await prismaAdmin.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const lang = tenant.localeDefault === 'ar' ? 'ar' : 'fr';

  const subject =
    lang === 'ar'
      ? `[${tenant.name}] تنبيه : ${toNotify.length} عقد(عقود) قارب على الانتهاء`
      : `[${tenant.name}] Alerte : ${toNotify.length} contrat(s) à renouveler`;

  const html = buildEmailHtml(toNotify, lang, tenant.name);
  const text = buildEmailText(toNotify, lang, tenant.name);

  await Promise.all(
    recipients.map((r) =>
      safeSendEmail({
        to: r.email,
        subject,
        html,
        text,
      }),
    ),
  );

  return { recipients: recipients.length, alerts: toNotify.length };
}

function buildEmailHtml(alerts: ContractAlert[], lang: 'fr' | 'ar', tenantName: string): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const labels =
    lang === 'ar'
      ? {
          intro: `يحتوي ${tenantName} على عقود مرشحة للتجديد :`,
          name: 'الاسم',
          type: 'النوع',
          end: 'تاريخ النهاية',
          remaining: 'الأيام المتبقية',
          actionHint: 'يُرجى مراجعة هذه العقود في الإعدادات > الموظفون.',
        }
      : {
          intro: `${tenantName} a des contrats à renouveler :`,
          name: 'Nom',
          type: 'Type',
          end: 'Fin',
          remaining: 'Jours restants',
          actionHint: 'Merci de vérifier ces contrats dans Personnes > Enseignants/Personnel.',
        };
  const rows = alerts
    .map(
      (a) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${a.lastName} ${a.firstName}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${a.contractType ?? '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${a.endDate.toISOString().slice(0, 10)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${a.daysToEnd}</td>
        </tr>`,
    )
    .join('');
  return `<!doctype html>
<html dir="${dir}">
  <body style="font-family:system-ui,sans-serif;color:#111827;max-width:680px;margin:0 auto;padding:24px;">
    <h2 style="margin:0 0 16px 0;">LeadSchool</h2>
    <p>${labels.intro}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#f1f5f9;text-align:${dir === 'rtl' ? 'right' : 'left'};">
          <th style="padding:8px;">${labels.name}</th>
          <th style="padding:8px;">${labels.type}</th>
          <th style="padding:8px;">${labels.end}</th>
          <th style="padding:8px;text-align:right;">${labels.remaining}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;color:#6b7280;font-size:13px;">${labels.actionHint}</p>
  </body>
</html>`;
}

function buildEmailText(alerts: ContractAlert[], lang: 'fr' | 'ar', tenantName: string): string {
  const intro =
    lang === 'ar'
      ? `${tenantName} : ${alerts.length} عقد(عقود) قارب على الانتهاء`
      : `${tenantName} : ${alerts.length} contrat(s) à renouveler`;
  const lines = alerts.map(
    (a) =>
      `- ${a.lastName} ${a.firstName} (${a.contractType ?? '—'}) — ${a.endDate.toISOString().slice(0, 10)} — ${a.daysToEnd}j`,
  );
  return [intro, '', ...lines].join('\n');
}
