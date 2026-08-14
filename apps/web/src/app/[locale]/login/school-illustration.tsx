/**
 * Illustration de la page de connexion — gestion d'établissement scolaire.
 *
 * SVG inline plutôt qu'un fichier image : les aplats utilisent les classes
 * `fill-brand-*`, donc l'illustration suit automatiquement la couleur
 * principale choisie par l'établissement (Paramètres → Apparence), et le
 * rendu reste net à toute résolution.
 */
export function SchoolIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={className}
      role="img"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Ombre au sol */}
      <ellipse cx="200" cy="268" rx="150" ry="14" className="fill-brand-100" />

      {/* ── Bâtiment ─────────────────────────────────────────────────── */}
      {/* Mât et drapeau */}
      <rect x="198" y="34" width="3" height="34" rx="1.5" className="fill-brand-800" />
      <path d="M201 38h30l-8 9 8 9h-30z" className="fill-amber-400" />

      {/* Fronton */}
      <path d="M200 62 L302 108 H98 Z" className="fill-brand-700" />
      <path d="M200 62 L302 108 H200 Z" className="fill-brand-800" />

      {/* Corps principal */}
      <rect x="112" y="108" width="176" height="120" className="fill-brand-600" />
      <rect x="200" y="108" width="88" height="120" className="fill-brand-700" />

      {/* Colonnes */}
      {[128, 160, 216, 248].map((x) => (
        <g key={x}>
          <rect x={x} y="126" width="14" height="86" rx="2" className="fill-white/85" />
          <rect x={x - 3} y="120" width="20" height="7" rx="2" className="fill-white" />
          <rect x={x - 3} y="210" width="20" height="7" rx="2" className="fill-white" />
        </g>
      ))}

      {/* Horloge du fronton */}
      <circle cx="200" cy="90" r="13" className="fill-white" />
      <circle cx="200" cy="90" r="13" className="fill-none stroke-brand-900" strokeWidth="2" />
      <path d="M200 83v7l5 4" className="fill-none stroke-brand-900" strokeWidth="2" strokeLinecap="round" />

      {/* Porte centrale */}
      <path d="M186 228v-38a14 14 0 0 1 28 0v38z" className="fill-brand-900" />
      <circle cx="207" cy="210" r="2" className="fill-amber-400" />

      {/* Marches */}
      <rect x="104" y="228" width="192" height="8" rx="2" className="fill-brand-200" />
      <rect x="94" y="236" width="212" height="8" rx="2" className="fill-brand-100" />

      {/* ── Livres, au premier plan à gauche ─────────────────────────── */}
      <rect x="52" y="216" width="70" height="12" rx="3" className="fill-amber-500" />
      <rect x="46" y="228" width="82" height="12" rx="3" className="fill-brand-500" />
      <rect x="56" y="240" width="62" height="12" rx="3" className="fill-brand-800" />
      <rect x="60" y="220" width="8" height="4" rx="2" className="fill-white/60" />
      <rect x="54" y="232" width="8" height="4" rx="2" className="fill-white/60" />

      {/* Toque de diplômé posée sur la pile */}
      <path d="M87 196 L118 208 L87 220 L56 208 Z" className="fill-brand-900" />
      <path d="M87 205 L104 212v11c0 4-8 6-17 6s-17-2-17-6v-11z" className="fill-brand-800" />
      <path d="M118 208v14" className="stroke-amber-400" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="118" cy="224" r="3.5" className="fill-amber-400" />

      {/* ── Carte « effectifs », au premier plan à droite ─────────────── */}
      <rect x="284" y="176" width="76" height="68" rx="8" className="fill-white" />
      <rect
        x="284"
        y="176"
        width="76"
        height="68"
        rx="8"
        className="fill-none stroke-brand-200"
        strokeWidth="2"
      />
      <rect x="284" y="176" width="76" height="16" rx="8" className="fill-brand-600" />
      <rect x="292" y="181" width="26" height="5" rx="2.5" className="fill-white/80" />
      {/* Petit histogramme = pilotage / effectifs */}
      <rect x="295" y="222" width="10" height="14" rx="2" className="fill-brand-300" />
      <rect x="311" y="212" width="10" height="24" rx="2" className="fill-brand-600" />
      <rect x="327" y="202" width="10" height="34" rx="2" className="fill-amber-500" />
      <rect x="343" y="216" width="10" height="20" rx="2" className="fill-brand-400" />

      {/* Étincelles décoratives */}
      <circle cx="72" cy="86" r="4" className="fill-amber-400" />
      <circle cx="340" cy="70" r="5" className="fill-brand-300" />
      <circle cx="318" cy="126" r="3" className="fill-amber-400" />
      <circle cx="60" cy="150" r="3" className="fill-brand-300" />
    </svg>
  );
}
