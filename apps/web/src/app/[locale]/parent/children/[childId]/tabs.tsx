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
    <div className="folder-tabs mb-5">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`folder-tab ${current === tab.key ? 'is-active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
