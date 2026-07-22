/**
 * Démo de style « Smart dashboard » appliquée à LeadSchool (aperçu uniquement).
 * Page autonome, données fictives — sert à évaluer une direction visuelle :
 * sidebar indigo arrondie, fond clair, cartes arrondies, donuts & barres.
 * URL : /<locale>/style-demo
 */
import Link from 'next/link';

const NAV = [
  { label: 'Tableau de bord', icon: '▦', active: true },
  { label: 'Leçons', icon: '▤' },
  { label: 'Emploi du temps', icon: '▦' },
  { label: 'Matières', icon: '▣' },
  { label: 'Forum', icon: '▢' },
  { label: 'Évaluations', icon: '▥' },
  { label: 'Paramètres', icon: '⚙' },
];

const BARS = [
  { label: 'Structures algo.', value: 85.3 },
  { label: 'Prog. objet', value: 64.7 },
  { label: 'Bases de données', value: 84.2 },
  { label: 'Dév. web', value: 45.6 },
  { label: 'Appli. mobile', value: 43.5 },
  { label: 'Machine learning', value: 74.4 },
];

const DONUTS = [
  { label: 'Structures algo.', value: 92 },
  { label: 'Prog. objet', value: 83 },
  { label: 'Bases de données', value: 78 },
  { label: 'Dév. web', value: 97 },
  { label: 'Appli. mobile', value: 96 },
  { label: 'Machine learning', value: 89 },
];

const AGENDA = [
  { time: '10:00', title: 'Leçon d’électronique', sub: '9.45–10.30 · salle 21', active: true },
  { time: '11:00', title: 'Leçon d’électronique', sub: '11.00–11.40 · salle 23' },
  { time: '12:00', title: 'Leçon de robotique', sub: '12.05–12.45 · salle 23' },
  { time: '13:00', title: 'Leçon de C++', sub: '13.45–14.30 · salle 21' },
];

const TEACHERS = [
  { name: 'Mary Johnson (mentor)', subject: 'Sciences', initials: 'MJ' },
  { name: 'James Brown', subject: 'Langue étrangère (chinois)', initials: 'JB' },
];

const EVENTS = [
  { title: 'L’événement « Robot Fest » arrive bientôt…', date: '14 déc. 2023 · 12:00', icon: '🤖' },
  { title: 'Webinaire des nouveaux outils Minecraft', date: '21 déc. 2023 · 11:00', icon: '🎮' },
];

const BRAND = '#3b5bff';

function Donut({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="grid h-20 w-20 place-items-center rounded-full"
        style={{ background: `conic-gradient(${BRAND} ${value * 3.6}deg, #e6e9f5 0deg)` }}
      >
        <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-sm font-semibold text-slate-800">
          {value}%
        </div>
      </div>
      <span className="text-center text-[11px] leading-tight text-slate-500">{label}</span>
    </div>
  );
}

export default function StyleDemoPage() {
  const maxBar = Math.max(...BARS.map((b) => b.value));
  return (
    <div className="flex min-h-screen bg-[#eef0f7] font-sans text-slate-800">
      {/* Sidebar */}
      <aside className="m-3 flex w-60 shrink-0 flex-col rounded-3xl bg-gradient-to-b from-[#3f3ad1] to-[#2b2796] p-5 text-white">
        <div className="mb-8 flex items-center gap-2 text-xl font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20">🎓</span>
          LeadSchool
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.map((n) => (
            <div
              key={n.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                n.active ? 'bg-white font-semibold text-[#2b2796] shadow' : 'text-white/75 hover:bg-white/10'
              }`}
            >
              <span className="text-base">{n.icon}</span>
              {n.label}
            </div>
          ))}
        </nav>
        <button className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-white/10">
          <span>⎋</span> Se déconnecter
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 p-3 ps-0">
        {/* Top bar */}
        <header className="mb-4 flex items-center gap-3 rounded-3xl bg-white px-5 py-3 shadow-sm">
          <div className="flex flex-1 items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-400">
            🔍 <span>Rechercher</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <span className="rounded-full px-2 py-1 text-xs font-medium text-slate-600">FR ▾</span>
            <span>✉️</span>
            <span>🔔</span>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                GS
              </span>
              <span className="text-sm font-medium text-slate-700">Grace Stanley ▾</span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Colonne principale */}
          <div className="space-y-4 xl:col-span-2">
            {/* Hero */}
            <section className="flex items-center justify-between gap-4 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8ebff] to-[#f3f0ff] p-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Bonjour Grace !</h1>
                <p className="mt-1 max-w-xs text-sm text-slate-600">
                  Vous avez 3 nouvelles tâches aujourd’hui. Beaucoup de travail — c’est parti !
                </p>
                <button className="mt-3 text-sm font-semibold text-brand-500 underline-offset-2 hover:underline">
                  consulter
                </button>
              </div>
              <div className="grid h-28 w-40 place-items-center rounded-2xl bg-white/50 text-5xl">🧑‍💻</div>
            </section>

            {/* Performance (barres) */}
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-800">Performance</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Décembre ▾
                </span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="me-4">
                  <div className="text-3xl font-bold text-slate-900">95.4</div>
                  <div className="text-xs text-slate-400">Intro. à la programmation</div>
                  <button className="mt-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
                    Toutes les leçons
                  </button>
                </div>
                <div className="flex flex-1 items-end justify-between gap-3">
                  {BARS.map((b) => (
                    <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-500">{b.value}</span>
                      <div className="flex h-32 w-full items-end justify-center">
                        <div
                          className="w-3.5 rounded-full bg-gradient-to-t from-brand-500 to-[#8aa0ff]"
                          style={{ height: `${(b.value / maxBar) * 100}%` }}
                        />
                      </div>
                      <span className="h-8 text-center text-[10px] leading-tight text-slate-400">
                        {b.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Ma visite (donuts) */}
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-800">Ma progression</h2>
              <div className="grid grid-cols-3 gap-y-6">
                {DONUTS.map((d) => (
                  <Donut key={d.label} value={d.value} label={d.label} />
                ))}
              </div>
            </section>

            {/* Enseignants liés */}
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-800">Enseignants liés</h2>
                <span className="text-xs font-medium text-brand-500">Tout voir</span>
              </div>
              <div className="space-y-2">
                {TEACHERS.map((t) => (
                  <div
                    key={t.name}
                    className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                      {t.initials}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">{t.name}</div>
                      <div className="text-xs text-slate-400">{t.subject}</div>
                    </div>
                    <span className="text-slate-300">✉️ 📞</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Colonne droite */}
          <div className="space-y-4">
            {/* Agenda */}
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-800">Agenda</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Aujourd’hui ▾
                </span>
              </div>
              <p className="mb-4 text-xs text-slate-400">4 événements aujourd’hui</p>
              <div className="space-y-3">
                {AGENDA.map((a) => (
                  <div key={a.title + a.time} className="flex gap-3">
                    <span className="w-10 pt-1 text-xs text-slate-400">{a.time}</span>
                    <div
                      className={`flex-1 rounded-2xl px-4 py-3 ${
                        a.active ? 'bg-brand-500 text-white' : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="text-sm font-semibold">{a.title}</div>
                      <div className={`text-xs ${a.active ? 'text-white/80' : 'text-slate-400'}`}>
                        ⏱ {a.sub}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* À venir */}
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-800">Événements à venir</h2>
                <span className="text-xs font-medium text-brand-500">Tout voir</span>
              </div>
              <div className="space-y-3">
                {EVENTS.map((e) => (
                  <div
                    key={e.title}
                    className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-2xl">
                      {e.icon}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium leading-snug text-slate-800">{e.title}</div>
                      <div className="mt-1 text-xs text-slate-400">📅 {e.date}</div>
                    </div>
                    <span className="text-slate-300">⋮</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Aperçu de style — données fictives.{' '}
          <Link href="./" className="text-brand-500 hover:underline">
            retour
          </Link>
        </p>
      </div>
    </div>
  );
}
