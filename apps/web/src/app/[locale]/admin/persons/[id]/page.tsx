import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { PersonActions } from './person-actions';

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('admin.persons');
  const tDetail = await getTranslations('admin.persons.detail');
  const tForm = await getTranslations('admin.persons.form');

  const person = await withTenant(tenantId, async (tx) =>
    tx.person.findUnique({
      where: { id },
      include: {
        role: true,
        studentClasses: {
          include: {
            class: { include: { level: true, academicYear: true } },
          },
        },
        relationsAsChild: {
          include: { parent: true },
        },
        relationsAsParent: {
          include: { child: true },
        },
      },
    }),
  );

  if (!person) notFound();

  // Fratrie déduite : autres élèves ayant au moins un parent en commun.
  let siblings: { id: string; firstName: string; lastName: string }[] = [];
  if (person.type === 'STUDENT' && person.relationsAsChild.length > 0) {
    const parentIds = person.relationsAsChild.map((r) => r.parentId);
    siblings = await withTenant(tenantId, async (tx) => {
      const rels = await tx.personRelation.findMany({
        where: {
          parentId: { in: parentIds },
          childId: { not: person.id },
        },
        include: { child: true },
        distinct: ['childId'],
      });
      return rels.map((r) => ({
        id: r.child.id,
        firstName: r.child.firstName,
        lastName: r.child.lastName,
      }));
    });
  }

  const contacts = (person.contacts ?? {}) as { email?: string; phone?: string; whatsapp?: string };
  const address = (person.address ?? {}) as {
    line1?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };

  // Breadcrumb dynamique : renvoie vers la liste filtrée selon le type.
  const backHref = `/${locale}/admin/persons?type=${person.type}`;
  const backLabel = t(`title.${person.type}` as never);

  const roleLabel = person.role
    ? locale === 'ar'
      ? person.role.labelAr
      : person.role.labelFr
    : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={backHref} className="hover:text-brand-700">
          {backLabel}
        </Link>
        <span className="mx-1.5">›</span>
        <span>
          {person.lastName} {person.firstName}
        </span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-xl bg-slate-200 text-2xl font-semibold text-slate-600">
            {(person.firstName[0] ?? '') + (person.lastName[0] ?? '')}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {person.lastName} {person.firstName}
              {person.deletedAt && (
                <span className="ms-3 rounded bg-slate-200 px-2 py-0.5 align-middle text-xs text-slate-600">
                  {t('archived')}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {tForm(`types.${person.type}` as never)}
              {roleLabel && ` · ${roleLabel}`}
              {person.birthDate &&
                ` · ${tDetail('bornOn', { date: new Date(person.birthDate).toLocaleDateString(locale) })}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {person.type === 'STUDENT' && (
            <Link
              href={`/${locale}/admin/persons/${person.id}/finance`}
              className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              {tDetail('finance')}
            </Link>
          )}
          <PersonActions personId={person.id} isArchived={!!person.deletedAt} locale={locale} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700">{tDetail('contact')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Email" value={contacts.email} />
            <Row label={tDetail('phone')} value={contacts.phone} />
            <Row label="WhatsApp" value={contacts.whatsapp} />
            <Row
              label={tDetail('address')}
              value={
                [address.line1, address.postalCode, address.city, address.country]
                  .filter(Boolean)
                  .join(', ') || undefined
              }
            />
            <Row label={tDetail('cin')} value={person.cin ?? undefined} />
            <Row label={tDetail('nationality')} value={person.nationality ?? undefined} />
          </dl>
        </section>

        <aside className="space-y-4">
          {person.type === 'STUDENT' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('classes')}</h2>
              {person.studentClasses.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">{tDetail('noClass')}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {person.studentClasses.map((sc) => (
                    <li key={sc.id} className="rounded-lg border border-slate-100 px-3 py-1.5">
                      <span className="font-medium text-slate-900">{sc.class.name}</span>
                      <span className="ms-1.5 text-xs text-slate-500">
                        ({sc.class.academicYear.label})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {person.type === 'STUDENT' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('parents')}</h2>
              {person.relationsAsChild.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">{tDetail('noParent')}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {person.relationsAsChild.map((r) => (
                    <li key={r.id} className="rounded-lg border border-slate-100 px-3 py-1.5">
                      <Link
                        href={`/${locale}/admin/persons/${r.parent.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700"
                      >
                        {r.parent.lastName} {r.parent.firstName}
                      </Link>
                      <span className="ms-1.5 text-xs text-slate-500">
                        ({tDetail(`relations.${r.type}` as never)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {person.type === 'STUDENT' && siblings.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('siblings')}</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {siblings.map((s) => (
                  <li key={s.id} className="rounded-lg border border-slate-100 px-3 py-1.5">
                    <Link
                      href={`/${locale}/admin/persons/${s.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {s.lastName} {s.firstName}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-slate-400">{tDetail('siblingsHint')}</p>
            </section>
          )}

          {person.type === 'PARENT' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('children')}</h2>
              {person.relationsAsParent.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">{tDetail('noChild')}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {person.relationsAsParent.map((r) => (
                    <li key={r.id} className="rounded-lg border border-slate-100 px-3 py-1.5">
                      <Link
                        href={`/${locale}/admin/persons/${r.child.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700"
                      >
                        {r.child.lastName} {r.child.firstName}
                      </Link>
                      <span className="ms-1.5 text-xs text-slate-500">
                        ({tDetail(`relations.${r.type}` as never)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">{tDetail('meta')}</h2>
            <dl className="mt-3 space-y-2 text-xs text-slate-600">
              <Row label="ID" value={person.id} mono />
              <Row label={tDetail('createdAt')} value={new Date(person.createdAt).toLocaleString(locale)} />
              <Row label={tDetail('updatedAt')} value={new Date(person.updatedAt).toLocaleString(locale)} />
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-slate-500">{label}</dt>
      <dd className={`flex-1 ${mono ? 'font-mono text-xs' : ''} text-slate-900`}>
        {value ?? <span className="text-slate-400">—</span>}
      </dd>
    </div>
  );
}
