import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Intégration passerelle CMI (Centre Monétique Interbancaire, Maroc).
 * Modèle « 3D_PAY_HOSTING » : on POST un formulaire signé vers la page de
 * paiement CMI ; l'utilisateur paie ; CMI redirige (okUrl/failUrl) ET appelle
 * le callback serveur-à-serveur (signé). La signature utilise l'algorithme
 * **ver3** (SHA-512 base64 sur les paramètres triés).
 *
 * Config par variables d'environnement (par établissement en prod ; ici global
 * dev/sandbox) :
 *   CMI_GATEWAY_URL   URL du formulaire CMI (sandbox : testpayment.cmi.co.ma)
 *   CMI_MERCHANT_ID   clientid marchand
 *   CMI_STORE_KEY     clé secrète (storekey) pour la signature
 * Non configuré (ex. merchant id vide) → `cmiConfigured()` renvoie false et
 * l'UI affiche « bientôt disponible ».
 */

export type CmiConfig = { gatewayUrl: string; clientId: string; storeKey: string };

export function getCmiConfig(): CmiConfig | null {
  const gatewayUrl = process.env.CMI_GATEWAY_URL?.trim();
  const clientId = process.env.CMI_MERCHANT_ID?.trim();
  const storeKey = process.env.CMI_STORE_KEY?.trim();
  if (!gatewayUrl || !clientId || !storeKey) return null;
  return { gatewayUrl, clientId, storeKey };
}

export function cmiConfigured(): boolean {
  return getCmiConfig() !== null;
}

/** Échappe une valeur pour le calcul du hash ver3 (`\` → `\\`, `|` → `\|`). */
function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

/**
 * Hash ver3 CMI : trie les clés (insensible à la casse, hors `hash`/`encoding`),
 * concatène les valeurs échappées séparées par `|`, ajoute la storeKey, puis
 * SHA-512 encodé en base64.
 */
export function computeVer3Hash(params: Record<string, string>, storeKey: string): string {
  const keys = Object.keys(params)
    .filter((k) => {
      const lk = k.toLowerCase();
      return lk !== 'hash' && lk !== 'encoding';
    })
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en'));
  const plain = keys.map((k) => esc(params[k] ?? '')).join('|') + '|' + esc(storeKey);
  return createHash('sha512').update(plain, 'utf8').digest('base64');
}

/** Devise ISO numérique (MAD = 504). */
const CURRENCY_ISO: Record<string, string> = { MAD: '504', EUR: '978', USD: '840' };

/**
 * Construit le formulaire signé à POSTer vers CMI pour une vente immédiate.
 * `oid` = id de la commande OnlinePayment. Renvoie l'action et les champs cachés.
 */
export function buildCmiRequest(input: {
  oid: string;
  amount: number;
  currency?: string;
  okUrl: string;
  failUrl: string;
  callbackUrl: string;
  lang?: string;
  email?: string | null;
}): { action: string; fields: Record<string, string> } {
  const cfg = getCmiConfig();
  if (!cfg) throw new Error('CMI non configuré.');
  const fields: Record<string, string> = {
    clientid: cfg.clientId,
    storetype: '3D_PAY_HOSTING',
    trantype: 'PreAuth',
    amount: input.amount.toFixed(2),
    currency: CURRENCY_ISO[input.currency ?? 'MAD'] ?? '504',
    oid: input.oid,
    okUrl: input.okUrl,
    failUrl: input.failUrl,
    callbackURL: input.callbackUrl,
    shopurl: input.okUrl,
    lang: (input.lang ?? 'fr') === 'ar' ? 'ar' : 'fr',
    rnd: `${Date.now()}${Math.random().toString(36).slice(2, 10)}`,
    hashAlgorithm: 'ver3',
    encoding: 'UTF-8',
    ...(input.email ? { email: input.email } : {}),
  };
  fields.hash = computeVer3Hash(fields, cfg.storeKey);
  return { action: cfg.gatewayUrl, fields };
}

/** Vérifie la signature d'un callback CMI et si le paiement est approuvé. */
export function verifyCmiCallback(params: Record<string, string>): {
  valid: boolean;
  approved: boolean;
  oid: string | null;
  procReturnCode: string | null;
  transId: string | null;
} {
  const cfg = getCmiConfig();
  const received = params.HASH ?? params.hash ?? '';
  const expected = cfg ? computeVer3Hash(params, cfg.storeKey) : '';
  const valid = !!cfg && received.length > 0 && received === expected;
  const procReturnCode = params.ProcReturnCode ?? params.procreturncode ?? null;
  const response = (params.Response ?? params.response ?? '').toLowerCase();
  const approved = valid && procReturnCode === '00' && (response === 'approved' || response === '');
  return {
    valid,
    approved,
    oid: params.oid ?? params.oID ?? params.ReturnOid ?? null,
    procReturnCode,
    transId: params.TransId ?? params.transid ?? null,
  };
}
