'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Chart.js chargé depuis le CDN jsDelivr, sans dépendance npm. Version figée
 * pour qu'une nouvelle majeure ne change pas les écrans du jour au lendemain.
 */
export const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

type ChartInstance = { destroy(): void };
type ChartCtor = new (el: HTMLCanvasElement, config: unknown) => ChartInstance;

declare global {
  interface Window {
    Chart?: ChartCtor;
  }
}

/**
 * Chargement unique et partagé.
 *
 * Chaque graphique attend la même promesse : avec une balise de script par
 * graphique, seul le premier montré recevait l'événement « chargé » (le
 * navigateur ne retélécharge pas un script déjà présent) et les suivants
 * restaient vides.
 */
let loading: Promise<ChartCtor> | null = null;

function loadChart(): Promise<ChartCtor> {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (loading) return loading;
  loading = new Promise<ChartCtor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHART_JS_CDN}"]`);
    const el = existing ?? document.createElement('script');
    const done = () => (window.Chart ? resolve(window.Chart) : reject(new Error('Chart.js indisponible')));
    el.addEventListener('load', done);
    el.addEventListener('error', () => reject(new Error('Chart.js : échec de chargement')));
    if (!existing) {
      el.src = CHART_JS_CDN;
      el.async = true;
      document.head.appendChild(el);
    }
  });
  return loading;
}

/**
 * Graphique Chart.js rendu sur un `<canvas>`.
 *
 * `config` est la configuration Chart.js telle quelle (`type`, `data`,
 * `options`). Le graphique est recréé quand `deps` change — typiquement les
 * données sérialisées. La légende native permet de barrer une série pour la
 * masquer.
 */
export function ChartCanvas({
  config,
  deps,
  height = 280,
  label,
}: {
  config: Record<string, unknown>;
  deps: string;
  height?: number;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadChart().then(
      () => alive && setReady(true),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !ref.current || !window.Chart) return;
    const chart = new window.Chart(ref.current, config);
    return () => chart.destroy();
    // La configuration porte des fonctions (infobulles) : on se fie à `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, deps]);

  return (
    <div className="relative w-full" style={{ height }}>
      <canvas ref={ref} role="img" aria-label={label} />
    </div>
  );
}
