import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { ClassForm } from '../../class-form';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import { ClassHeader, CLASS_PAGE_SHELL } from '../class-header';

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.classes');

  const { cls, years, levels, teachers, rooms } = await withTenant(session.user.tenantId, async (tx) => {
    const [cls, years, levels, teachers, rooms] = await Promise.all([
      tx.class.findUnique({
        where: { id },
        include: {
          level: { include: { cycle: true } },
          academicYear: true,
          mainTeacher: true,
        },
      }),
      tx.academicYear.findMany({ orderBy: { startDate: 'desc' } }),
      tx.level.findMany({ include: { cycle: true }, orderBy: { order: 'asc' } }),
      tx.person.findMany({
        where: { type: 'TEACHER', deletedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      tx.room.findMany({ orderBy: { code: 'asc' } }),
    ]);
    return {
      cls,
      years: years.map((y) => ({ id: y.id, label: y.label })),
      levels: levels.map((l) => ({ id: l.id, label: `${localizedLabel(locale, l.cycle.label, l.cycle.labelAr)} — ${localizedLabel(locale, l.label, l.labelAr)}` })),
      teachers: teachers.map((p) => ({ id: p.id, label: personDisplayName(locale, p) })),
      rooms: rooms.map((r) => ({ id: r.id, label: `${r.code} — ${r.label}` })),
    };
  });

  if (!cls) notFound();

  return (
    <div className={CLASS_PAGE_SHELL}>
      {/* « Modifier » est un bouton de la barre de classe au même titre que les
          autres : il avait été oublié dans l'unification des en-têtes et
          gardait sa propre largeur, son propre fil d'Ariane et pas de barre de
          navigation — on ne pouvait plus passer de Modifier à un autre onglet
          sans repasser par la fiche. */}
      <ClassHeader cls={cls} locale={locale} current={t('actions.edit')} />

      {/* Le formulaire reste étroit : une ligne de saisie pleine largeur se lit
          mal, alors que la bande, elle, doit aller au bord comme partout. */}
      <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6">
        <ClassForm
          mode="edit"
          locale={locale}
          years={years}
          levels={levels}
          teachers={teachers}
          rooms={rooms}
          initial={{
            id: cls.id,
            name: localizedLabel(locale, cls.name, cls.nameAr),
            capacity: cls.capacity,
            academicYearId: cls.academicYearId,
            levelId: cls.levelId,
            mainTeacherId: cls.mainTeacherId,
            homeRoomId: (cls.metadata as { homeRoomId?: string } | null)?.homeRoomId ?? null,
          }}
        />
      </div>
    </div>
  );
}
