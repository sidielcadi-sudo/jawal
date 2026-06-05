import { redirect } from 'next/navigation';

// Point 5 : le menu Pilotage a été supprimé et ses KPI fusionnés dans le
// tableau de bord (affichés à la direction). On redirige les anciens liens.
export default async function PilotageRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/admin`);
}
