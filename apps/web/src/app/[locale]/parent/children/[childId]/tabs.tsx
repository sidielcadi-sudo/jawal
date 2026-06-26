import Link from 'next/link';

/** Barre d'onglets (liens) pour les sections enfant du portail parent. */
export function ChildTabs({
  tabs,
  current,
}: {
  tabs: { key: string; label: string; href: string }[];
  current: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-100">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            current === tab.key
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
