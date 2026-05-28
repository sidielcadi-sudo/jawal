import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { PersonForm } from '../../person-form';

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.persons');

  const person = await withTenant(session.user.tenantId, (tx) =>
    tx.person.findUnique({ where: { id } }),
  );
  if (!person) notFound();

  const contacts = (person.contacts ?? {}) as { email?: string; phone?: string; whatsapp?: string };
  const address = (person.address ?? {}) as {
    line1?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/persons`} className="hover:text-brand-700">
          {t('title.ALL')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/persons/${id}`} className="hover:text-brand-700">
          {person.lastName} {person.firstName}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('actions.edit')}</span>
      </nav>

      <h1 className="text-2xl font-semibold text-slate-900">
        {t('actions.edit')} — {person.lastName} {person.firstName}
      </h1>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <PersonForm
          mode="edit"
          locale={locale}
          initial={{
            id: person.id,
            type: person.type,
            firstName: person.firstName,
            lastName: person.lastName,
            birthDate: person.birthDate ? person.birthDate.toISOString().slice(0, 10) : undefined,
            gender: person.gender ?? undefined,
            nationality: person.nationality ?? undefined,
            cin: person.cin ?? undefined,
            contacts,
            address,
          }}
        />
      </div>
    </div>
  );
}
