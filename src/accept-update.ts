import type { Bot } from 'grammy';

/**
 * Answer Telegram at once and finish the update in the background (all three bots use it). A receipt scan can take longer
 * than the 10 seconds a webhook response may wait; when one update failed, Telegram retried it
 * and held the chat's later messages behind it, so the group went silent. The update runs under
 * `waitUntil` (up to 30 more seconds), and a failure is logged instead of being retried forever.
 */
export async function acceptUpdate(
  bot: Bot,
  request: Request,
  ctx: Pick<ExecutionContext, 'waitUntil'>,
  name = 'split'
): Promise<Response> {
  const update = (await request.json()) as Parameters<Bot['handleUpdate']>[0];
  const started = Date.now();
  ctx.waitUntil(
    bot
      .handleUpdate(update)
      .then(() => {
        const ms = Date.now() - started;
        if (ms > 8000) console.warn(`${name} update took ${ms} ms`);
      })
      .catch((error) => {
        // The error's own message only: updates carry payee numbers and receipts
        console.error(
          `${name} update failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`
        );
      })
  );
  return new Response('ok');
}
