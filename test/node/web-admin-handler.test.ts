import { describe, expect, it, vi } from 'vitest';
import { WebAdminCommandHandler } from '../../src/commands/web-admin-handler';
import { WebPaymentCommandHandler } from '../../src/commands/web-payment-handler';
import type { Event, EventRepository } from '../../src/db/repository';

const ev = (ref: string, name: string, status: Event['status'] = 'open') =>
  ({ id: 1, ref, chatId: 5, topicId: 0, name, status }) as Event;

function setup(events: Event[], baseUrl: string | undefined = 'https://web.test') {
  const repo = { listAllEventsByChat: vi.fn(async () => events) } as unknown as EventRepository;
  const ctx = { chat: { id: 5 }, from: { id: 5 }, message: {}, reply: vi.fn() };
  return { ctx, run: () => new WebAdminCommandHandler(repo, baseUrl).handle(ctx as never), repo };
}

describe('WebAdminCommandHandler', () => {
  it('replies with one link button per event', async () => {
    const { ctx, run } = setup([ev('AAA', 'Dinner'), ev('BBB', 'Trip', 'closed')]);
    await run();
    const kb = ctx.reply.mock.calls[0]![1].reply_markup.inline_keyboard.flat();
    expect(kb).toEqual([
      { text: '🟢 Dinner', url: 'https://web.test/events/AAA' },
      { text: '💳 Pay', url: 'https://web.test/pay/AAA' },
      { text: '🔴 Trip', url: 'https://web.test/events/BBB' },
      { text: '💳 Pay', url: 'https://web.test/pay/BBB' },
    ]);
  });

  it('replies with payer page links for each event', async () => {
    const { ctx, repo } = setup([ev('AAA', 'Dinner'), ev('BBB', 'Trip', 'closed')]);
    await new WebPaymentCommandHandler(repo, 'https://web.test/').handle(ctx as never);
    const kb = ctx.reply.mock.calls[0]![1].reply_markup.inline_keyboard.flat();
    expect(kb).toEqual([
      { text: '🟢 Dinner', url: 'https://web.test/pay/AAA' },
      { text: '🔴 Trip', url: 'https://web.test/pay/BBB' },
    ]);
    expect(ctx.reply.mock.calls[0]![0]).toContain('payment page');
  });

  it('says so when the chat has no events', async () => {
    const { ctx, run } = setup([]);
    await run();
    expect(ctx.reply.mock.calls[0]![0]).toContain('No events yet');
  });

  it('warns when the page URL is not configured, without querying events', async () => {
    const { ctx, run, repo } = setup([ev('AAA', 'Dinner')], '');
    await run();
    expect(ctx.reply.mock.calls[0]![0]).toContain('not configured');
    expect(repo.listAllEventsByChat).not.toHaveBeenCalled();
  });
});
