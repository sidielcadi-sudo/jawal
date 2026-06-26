import 'server-only';

/**
 * Drivers d'envoi réels derrière l'abstraction notify. Sélection via env
 * `NOTIFY_DRIVER` : 'log' (défaut, journalise sans envoi) | 'whatsapp_meta' |
 * 'twilio'. Les identifiants viennent de l'environnement — aucun secret en base.
 *
 * Variables d'environnement attendues :
 *  - whatsapp_meta : WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 *  - twilio        : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 *                    TWILIO_WHATSAPP_FROM (ex. "whatsapp:+212..."), TWILIO_SMS_FROM
 */
export type SendChannel = 'WHATSAPP' | 'SMS' | 'EMAIL';
export type SendResult = { ok: true; providerId?: string } | { ok: false; error: string };

export function activeDriver(): string {
  return process.env.NOTIFY_DRIVER ?? 'log';
}

/** True si un vrai fournisseur est configuré (≠ driver de dev « log »). */
export function isRealDriver(): boolean {
  return activeDriver() !== 'log';
}

const digits = (s: string) => s.replace(/[^\d+]/g, '');

export async function sendViaProvider(channel: SendChannel, to: string, body: string): Promise<SendResult> {
  const driver = activeDriver();
  try {
    if (driver === 'whatsapp_meta') return await sendWhatsAppMeta(to, body);
    if (driver === 'twilio') return await sendTwilio(channel, to, body);
    // 'log' / inconnu : considéré « envoyé » (développement).
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur fournisseur' };
  }
}

async function sendWhatsAppMeta(to: string, body: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: 'WhatsApp non configuré (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).' };
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: digits(to), type: 'text', text: { body } }),
  });
  if (!res.ok) return { ok: false, error: `WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
  return { ok: true, providerId: json.messages?.[0]?.id };
}

async function sendTwilio(channel: SendChannel, to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = channel === 'WHATSAPP' ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM;
  if (!sid || !auth || !from) return { ok: false, error: 'Twilio non configuré.' };
  const dest = channel === 'WHATSAPP' ? `whatsapp:${digits(to)}` : digits(to);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: dest, From: from, Body: body }),
  });
  if (!res.ok) return { ok: false, error: `Twilio ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const json = (await res.json().catch(() => ({}))) as { sid?: string };
  return { ok: true, providerId: json.sid };
}
