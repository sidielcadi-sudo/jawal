import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaAdmin } from '@/lib/db';
import { requirePermission } from '@/lib/auth/rbac';
import { EstablishmentForm, LogoUploader } from './client';

export default async function EstablishmentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission('tenants.manage'); // réservé tenant_admin
  const t = await getTranslations('admin.settings.establishment');
  const session = (await auth())!;

  const tenant = await prismaAdmin.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true, slug: true, localeDefault: true, currency: true, timezone: true, logoFileId: true },
  });
  if (!tenant) return <p className="text-sm text-slate-500">—</p>;

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t('title')}</h2>
      <p className="mb-4 text-xs text-slate-500">{t('subtitle')}</p>
      <EstablishmentForm
        initial={{
          name: tenant.name,
          slug: tenant.slug,
          localeDefault: tenant.localeDefault,
          currency: tenant.currency,
          timezone: tenant.timezone,
        }}
      />
      <LogoUploader hasLogo={Boolean(tenant.logoFileId)} />
    </div>
  );
}
