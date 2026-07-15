import { setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaAdmin } from '@/lib/db';
import { tenantPrimaryColor, tenantBandColor, tenantTableHeaderColor } from '@/lib/theme';
import { AppearanceForm } from './client';

export default async function AppearanceSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const tenant = await prismaAdmin.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { settings: true },
  });
  const primary = tenantPrimaryColor(tenant?.settings);
  const band = tenantBandColor(tenant?.settings);
  const tableHeader = tenantTableHeaderColor(tenant?.settings);

  return <AppearanceForm initialPrimary={primary} initialBand={band} initialTableHeader={tableHeader} />;
}
