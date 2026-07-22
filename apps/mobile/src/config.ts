/**
 * URL de l'API LeadSchool (app Next.js).
 *
 * ⚠️ En développement, NE PAS utiliser `localhost` : sur un téléphone (Expo Go),
 * `localhost` désigne le téléphone lui-même, pas votre ordinateur. Utilisez
 * l'IP LAN de la machine qui fait tourner `pnpm dev` (ex. 192.168.1.20), via un
 * fichier `.env` à la racine de apps/mobile :
 *
 *   EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
 *
 * (Trouver l'IP : `ipconfig` sous Windows → « Adresse IPv4 ».)
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
