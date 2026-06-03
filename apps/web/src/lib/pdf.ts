import 'server-only';
import { chromium, type Browser } from 'playwright';

/**
 * Génération PDF côté serveur via Chromium headless (Playwright).
 * Le navigateur est lancé une seule fois puis réutilisé entre les requêtes —
 * le lancement coûte ~1s, on l'amortit sur tous les bulletins (et le mode lot).
 */
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  const existing = await browserPromise?.catch(() => null);
  if (existing?.isConnected()) return existing;
  browserPromise = chromium.launch({ args: ['--no-sandbox'] });
  return browserPromise;
}

/**
 * Rend un document HTML autonome en PDF A4. `printBackground` conserve les
 * fonds (en-têtes de tableau, badges de mention).
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
    });
  } finally {
    await page.close();
  }
}
