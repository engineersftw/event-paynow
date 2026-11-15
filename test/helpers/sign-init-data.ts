/** Builds Mini App launch data signed the way Telegram signs it, for tests (Web Crypto, any pool). */
const enc = new TextEncoder();

async function hmac(key: BufferSource, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return crypto.subtle.sign('HMAC', k, enc.encode(message));
}

export async function signInitData(
  botToken: string,
  fields: Record<string, string>
): Promise<string> {
  const check = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const hash = [...new Uint8Array(await hmac(secret, check))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return new URLSearchParams({ ...fields, hash }).toString();
}

/** Launch data for a user opening the app from a link with `startapp=<startParam>`, issued at `authDate`. */
export function launchFields(
  user: { id: number; first_name: string; last_name?: string; username?: string },
  startParam: string,
  authDate = Math.floor(Date.now() / 1000)
): Record<string, string> {
  return {
    auth_date: String(authDate),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    start_param: startParam,
    user: JSON.stringify(user),
  };
}
