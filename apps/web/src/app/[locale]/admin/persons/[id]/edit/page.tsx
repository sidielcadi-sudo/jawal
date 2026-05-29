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

  const { person, roles, availableParents } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const [person, roles, availableParents] = await Promise.all([
        tx.person.findUnique({
          where: { id },
          include: { relationsAsChild: true },
        }),
        tx.personRole.findMany({
          where: { active: true },
          orderBy: [{ appliesTo: 'asc' }, { order: 'asc' }, { labelFr: 'asc' }],
        }),
        tx.person.findMany({
          where: { type: 'PARENT', deletedAt: null, id: { not: id } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: { id: true, firstName: true, lastName: true },
        }),
      ]);
      return { person, roles, availableParents };
    },
  );
  if (!person) notFound();

  const contacts = (person.contacts ?? {}) as { email?: string; phone?: string; whatsapp?: string };
  const address = (person.address ?? {}) as {
    line1?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };

  const backHref = `/${locale}/admin/persons?type=${person.type}`;
  const backLabel = t(`title.${person.type}` as never);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={backHref} className="hover:text-brand-700">
          {backLabel}
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
            roleId: person.roleId ?? undefined,
            firstName: person.firstName,
            lastName: person.lastName,
            birthDate: person.birthDate ? person.birthDate.toISOString().slice(0, 10) : undefined,
            gender: person.gender ?? undefined,
            nationality: person.nationality ?? undefined,
            cin: person.cin ?? undefined,
            contacts,
            address,
            parents: person.relationsAsChild.map((r) => ({
              parentId: r.parentId,
              type: r.type,
            })),
          }}
          roles={roles.map((r) => ({
            id: r.id,
            appliesTo: r.appliesTo,
            labelFr: r.labelFr,
            labelAr: r.labelAr,
          }))}
          availableParents={availableParents}
        />
      </div>
    </div>
  );
}
