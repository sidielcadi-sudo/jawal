/**
 * Utilitaires d'adresse (stockée en JSON sur Person.address).
 * Sert notamment au contrôle « l'élève doit partager l'adresse d'un parent/tuteur ».
 */

export type AddressLike = {
  line1?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

/** Une adresse est « renseignée » si au moins la ligne 1 et la ville le sont. */
export function isAddressFilled(a: unknown): boolean {
  if (!a || typeof a !== 'object') return false;
  const o = a as AddressLike;
  return norm(o.line1) !== '' && norm(o.city) !== '';
}

/**
 * Deux adresses correspondent si ligne1 + ville + code postal (normalisés)
 * sont identiques. Le pays est ignoré (souvent implicite « Maroc »).
 */
export function addressesMatch(a: unknown, b: unknown): boolean {
  if (!isAddressFilled(a) || !isAddressFilled(b)) return false;
  const x = a as AddressLike;
  const y = b as AddressLike;
  return (
    norm(x.line1) === norm(y.line1) &&
    norm(x.city) === norm(y.city) &&
    norm(x.postalCode) === norm(y.postalCode)
  );
}
