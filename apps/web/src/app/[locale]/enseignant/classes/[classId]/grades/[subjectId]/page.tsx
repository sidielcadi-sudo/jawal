import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

/**
 * Ancien écran de gestion des évaluations d'un couple classe × matière.
 *
 * La saisie se fait désormais en un seul endroit : l'onglet « Notes → Saisie »,
 * dont la grille crée les devoirs *et* saisit toutes les notes de la classe
 * d'un coup. Deux chemins pour la même tâche prêtaient à confusion — on
 * redirige donc vers la grille, préfiltrée sur la classe et la matière.
 *
 * La feuille d'une évaluation (`[evaluationId]`) reste accessible par lien
 * direct : elle sert encore aux relances depuis d'autres écrans.
 */
export default async function TeacherSubjectGradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; classId: string; subjectId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale, classId, subjectId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const q = new URLSearchParams({ class: classId, subject: subjectId });
  if (sp.period) q.set('period', sp.period);
  redirect(`/${locale}/enseignant/notes?${q.toString()}`);
}
