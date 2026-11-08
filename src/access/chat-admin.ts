/**
 * May this Telegram user view this chat's events? Chat administrators/owner, or the user
 * themself for a private chat (where chat id === user id). Checked live via the bot API so a
 * demoted admin loses access at once; any failure denies.
 */
export async function isChatAdmin(
  chatId: number,
  userId: number,
  botToken: string,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  if (chatId === userId) return true;
  try {
    const res = await fetchFn(
      `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${chatId}&user_id=${userId}`
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean; result?: { status?: string } };
    return body.ok === true && ['creator', 'administrator'].includes(body.result?.status ?? '');
  } catch {
    return false;
  }
}
