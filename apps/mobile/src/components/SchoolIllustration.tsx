import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

/**
 * Illustration de l'écran de connexion — portage fidèle de celle du portail web
 * (`apps/web/src/app/[locale]/login/school-illustration.tsx`). Mêmes formes,
 * mêmes proportions, mêmes couleurs, pour que les deux écrans se ressemblent.
 */

const BRAND = {
  c100: '#DBEAFE',
  c200: '#BFDBFE',
  c300: '#93C5FD',
  c400: '#60A5FA',
  c500: '#3B5BFF',
  c600: '#1A56DB',
  c700: '#143FA6',
  c800: '#123A8F',
  c900: '#0E2F73',
};
const AMBER_400 = '#FBBF24';
const AMBER_500 = '#F59E0B';
const WHITE = '#FFFFFF';

export function SchoolIllustration({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 400 300">
      {/* Ombre au sol */}
      <Ellipse cx="200" cy="268" rx="150" ry="14" fill={BRAND.c100} />

      {/* Mât et drapeau */}
      <Rect x="198" y="34" width="3" height="34" rx="1.5" fill={BRAND.c800} />
      <Path d="M201 38h30l-8 9 8 9h-30z" fill={AMBER_400} />

      {/* Fronton */}
      <Path d="M200 62 L302 108 H98 Z" fill={BRAND.c700} />
      <Path d="M200 62 L302 108 H200 Z" fill={BRAND.c800} />

      {/* Corps principal */}
      <Rect x="112" y="108" width="176" height="120" fill={BRAND.c600} />
      <Rect x="200" y="108" width="88" height="120" fill={BRAND.c700} />

      {/* Colonnes */}
      {[128, 160, 216, 248].map((x) => (
        <G key={x}>
          <Rect x={x} y={126} width={14} height={86} rx={2} fill={WHITE} opacity={0.85} />
          <Rect x={x - 3} y={120} width={20} height={7} rx={2} fill={WHITE} />
          <Rect x={x - 3} y={210} width={20} height={7} rx={2} fill={WHITE} />
        </G>
      ))}

      {/* Horloge */}
      <Circle cx="200" cy="90" r="13" fill={WHITE} />
      <Circle cx="200" cy="90" r="13" fill="none" stroke={BRAND.c900} strokeWidth="2" />
      <Path d="M200 83v7l5 4" fill="none" stroke={BRAND.c900} strokeWidth="2" strokeLinecap="round" />

      {/* Porte */}
      <Path d="M186 228v-38a14 14 0 0 1 28 0v38z" fill={BRAND.c900} />
      <Circle cx="207" cy="210" r="2" fill={AMBER_400} />

      {/* Marches */}
      <Rect x="104" y="228" width="192" height="8" rx="2" fill={BRAND.c200} />
      <Rect x="94" y="236" width="212" height="8" rx="2" fill={BRAND.c100} />

      {/* Livres */}
      <Rect x="52" y="216" width="70" height="12" rx="3" fill={AMBER_500} />
      <Rect x="46" y="228" width="82" height="12" rx="3" fill={BRAND.c500} />
      <Rect x="56" y="240" width="62" height="12" rx="3" fill={BRAND.c800} />

      {/* Toque de diplômé */}
      <Path d="M87 196 L118 208 L87 220 L56 208 Z" fill={BRAND.c900} />
      <Path d="M87 205 L104 212v11c0 4-8 6-17 6s-17-2-17-6v-11z" fill={BRAND.c800} />
      <Path d="M118 208v14" stroke={AMBER_400} strokeWidth="2.5" strokeLinecap="round" />
      <Circle cx="118" cy="224" r="3.5" fill={AMBER_400} />

      {/* Carte « effectifs » */}
      <Rect x="284" y="176" width="76" height="68" rx="8" fill={WHITE} />
      <Rect
        x="284"
        y="176"
        width="76"
        height="68"
        rx="8"
        fill="none"
        stroke={BRAND.c200}
        strokeWidth="2"
      />
      <Rect x="284" y="176" width="76" height="16" rx="8" fill={BRAND.c600} />
      <Rect x="295" y="222" width="10" height="14" rx="2" fill={BRAND.c300} />
      <Rect x="311" y="212" width="10" height="24" rx="2" fill={BRAND.c600} />
      <Rect x="327" y="202" width="10" height="34" rx="2" fill={AMBER_500} />
      <Rect x="343" y="216" width="10" height="20" rx="2" fill={BRAND.c400} />

      {/* Étincelles */}
      <Circle cx="72" cy="86" r="4" fill={AMBER_400} />
      <Circle cx="340" cy="70" r="5" fill={BRAND.c300} />
      <Circle cx="318" cy="126" r="3" fill={AMBER_400} />
      <Circle cx="60" cy="150" r="3" fill={BRAND.c300} />
    </Svg>
  );
}
