import { redirect } from 'next/navigation';

/**
 * Le référentiel (compétences & aptitudes) a été déplacé dans Paramétrage.
 * L'entrée « Compétences » du menu ouvre désormais le Bilan.
 */
export default async function CompetencesIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/admin/competences/bilan`);
}
