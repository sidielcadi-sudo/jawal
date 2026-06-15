import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { NotesTabs } from './tabs';

export default async function NotesLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <NotesTabs locale={locale} />
      <div className="mt-5">{children}</div>
    </div>
  );
}
