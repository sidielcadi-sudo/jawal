import { redirect } from 'next/navigation';

export default async function ParentChildIndex({
  params,
}: {
  params: Promise<{ locale: string; childId: string }>;
}) {
  const { locale, childId } = await params;
  redirect(`/${locale}/parent/children/${childId}/cahier`);
}
