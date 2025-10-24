import { callable } from '../firebase';

/** Variante 1: HTTP (Cloud Function HTTPS) */
export async function sendToBotHTTP({ endpointUrl, userId, text }) {
  const resp = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, text }),
  });
  if (!resp.ok) throw new Error('Bot HTTP error');
  return await resp.json(); // { text, payload? }
}

/** Variante 2: Callable (Firebase Functions) */
export async function sendToBotCallable({ userId, text }) {
  const resp = await callable.botWebhook({ userId, text });
  return resp?.data || { text: '...' };
}
