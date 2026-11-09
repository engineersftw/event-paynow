import { describe, expect, it, vi } from 'vitest';
import { EditEventHandler } from '../../src/commands/edit-event-handler';
import type { Event, EventPatch, EventRepository } from '../../src/db/repository';
import type { ConversationDO } from '../../src/worker/conversation-do';

const CHAT = 10;
const USER = 7;

function setup(opts: { events?: Event[]; admin?: boolean[] } = {}) {
  let ev: Event = {
    id: 1,
    ref: 'EVTREF0001',
    chatId: CHAT,
    topicId: 0,
    name: 'Dinner',
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    status: 'open',
    createdAt: '2024-01-01T00:00:00Z',
    closedAt: null,
    defaultAmountCents: 2100,
    websiteUrl: null,
  };
  const events = opts.events ?? [ev];
  let state: unknown = { flow: 'idle', step: 0, context: {} };
  const doStub = {
    fetch: vi.fn(async (req: Request) => {
      if (req.method === 'POST') state = JSON.parse(await req.text());
      return { status: 200, json: async () => state, body: null };
    }),
  } as unknown as ConversationDO;
  const repo = {
    listOpenEventsByChat: vi.fn(async () => events.filter((e) => e.status === 'open')),
    getEventByRef: vi.fn(async (ref: string) => events.find((e) => e.ref === ref) ?? null),
    updateEvent: vi.fn(async (ref: string, patch: EventPatch) => {
      const e = events.find((x) => x.ref === ref);
      if (!e || e.status !== 'open') return null;
      ev = Object.assign(e, patch);
      return e;
    }),
  } as unknown as EventRepository;
  const admin = [...(opts.admin ?? [true, true, true])];
  const isAdmin = vi.fn(async () => admin.shift() ?? true);
  const handler = new EditEventHandler(doStub, repo, isAdmin);
  const text = (t: string) =>
    ({ chat: { id: CHAT }, from: { id: USER }, message: { text: t }, reply: vi.fn() }) as any;
  const tap = (data: string, from = USER) =>
    ({
      chat: { id: CHAT },
      from: { id: from },
      callbackQuery: { data },
      answerCallbackQuery: vi.fn(),
      editMessageText: vi.fn(),
      reply: vi.fn(),
    }) as any;
  return { handler, repo, events, isAdmin, text, tap, event: () => events[0]! };
}

describe('EditEventHandler', () => {
  it('changes the name and shows all final values with the changed one marked', async () => {
    const { handler, text, tap, repo } = setup();
    const start = text('/edit_event');
    await handler.start(start);
    expect(start.reply.mock.calls[0][0]).toContain('What do you want to change?');
    await handler.handleCallback(tap('edit_field:name'));

    const input = text('Team lunch');
    expect(await handler.handleInput(input)).toBe(true);
    expect(repo.updateEvent).toHaveBeenCalledWith('EVTREF0001', { name: 'Team lunch' });
    const reply = input.reply.mock.calls[0][0] as string;
    expect(reply).toContain('Name: Team lunch ✏️');
    expect(reply).toContain('Mobile number: +6591234567');
    expect(reply).toContain('Default amount: SGD 21.00');
    expect(reply).toContain('Website: none');
  });

  it('changes the payee, rejecting an invalid one first', async () => {
    const { handler, text, tap, repo, event } = setup();
    await handler.start(text('/edit_event'));
    await handler.handleCallback(tap('edit_field:payee'));

    const bad = text('12345');
    await handler.handleInput(bad);
    expect(bad.reply.mock.calls[0][0]).toContain('Invalid reference');
    expect(repo.updateEvent).not.toHaveBeenCalled();

    const good = text('201234567A');
    await handler.handleInput(good);
    expect(event().payeeType).toBe('uen');
    expect(good.reply.mock.calls[0][0]).toContain('UEN: 201234567A ✏️');
  });

  it('sets and clears the default amount; bad amounts re-prompt', async () => {
    const { handler, text, tap, repo, event } = setup();
    await handler.start(text('/edit_event'));
    await handler.handleCallback(tap('edit_field:amount'));
    for (const v of ['abc', '0', '-5', '1.234']) {
      const bad = text(v);
      await handler.handleInput(bad);
      expect(bad.reply.mock.calls[0][0]).toContain('Invalid amount');
    }
    expect(repo.updateEvent).not.toHaveBeenCalled();
    await handler.handleInput(text('12.50'));
    expect(event().defaultAmountCents).toBe(1250);

    await handler.start(text('/edit_event'));
    await handler.handleCallback(tap('edit_field:amount'));
    const clear = tap('edit_clear_amount');
    await handler.handleCallback(clear);
    expect(event().defaultAmountCents).toBeNull();
    expect(clear.editMessageText.mock.calls[0][0]).toContain('Default amount: none ✏️');
  });

  it('sets and clears the website; unsafe or malformed addresses re-prompt', async () => {
    const { handler, text, tap, repo, event } = setup();
    await handler.start(text('/edit_event'));
    const ask = tap('edit_field:website');
    await handler.handleCallback(ask);
    expect(ask.editMessageText.mock.calls[0][0]).toContain("event's own page");
    // nothing to clear yet, so no Clear button
    const buttons = (ask.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard as any[][])
      .flat()
      .map((b) => b.callback_data);
    expect(buttons).not.toContain('edit_clear_website');

    for (const v of [
      'javascript:alert(1)',
      'data:text/html,x',
      'not a url',
      'https://u:p@example.com',
    ]) {
      const bad = text(v);
      await handler.handleInput(bad);
      expect(bad.reply.mock.calls[0][0]).toContain('not a valid web address');
    }
    expect(repo.updateEvent).not.toHaveBeenCalled();

    const good = text('example.com/lunch');
    await handler.handleInput(good);
    expect(repo.updateEvent).toHaveBeenCalledWith('EVTREF0001', {
      websiteUrl: 'https://example.com/lunch',
    });
    expect(event().websiteUrl).toBe('https://example.com/lunch');
    const reply = good.reply.mock.calls[0][0] as string;
    expect(reply).toContain('Website: https://example.com/lunch ✏️');
    expect(reply).toContain('Name: Dinner'); // every final value is listed

    // now there is something to clear
    await handler.start(text('/edit_event'));
    const ask2 = tap('edit_field:website');
    await handler.handleCallback(ask2);
    const buttons2 = (ask2.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard as any[][])
      .flat()
      .map((b) => b.callback_data);
    expect(buttons2).toContain('edit_clear_website');
    const clear = tap('edit_clear_website');
    await handler.handleCallback(clear);
    expect(event().websiteUrl).toBeNull();
    expect(clear.editMessageText.mock.calls[0][0]).toContain('Website: none ✏️');
  });

  it('refuses a non-admin at the start', async () => {
    const { handler, text, repo } = setup({ admin: [false] });
    const c = text('/edit_event');
    await handler.start(c);
    expect(c.reply.mock.calls[0][0]).toContain('administrators');
    expect(repo.listOpenEventsByChat).not.toHaveBeenCalled();
  });

  it('refuses at write time when admin rights were lost, changing nothing', async () => {
    const { handler, text, tap, repo } = setup({ admin: [true, false] });
    await handler.start(text('/edit_event'));
    await handler.handleCallback(tap('edit_field:name'));
    const input = text('Sneaky');
    await handler.handleInput(input);
    expect(repo.updateEvent).not.toHaveBeenCalled();
    expect(input.reply.mock.calls[0][0]).toContain('administrators');
  });

  it('reports a closed event and changes nothing', async () => {
    const { handler, text, tap, repo, event } = setup();
    await handler.start(text('/edit_event'));
    await handler.handleCallback(tap('edit_field:name'));
    event().status = 'closed';
    const input = text('Late');
    await handler.handleInput(input);
    expect(repo.updateEvent).not.toHaveBeenCalled();
    expect(input.reply.mock.calls[0][0]).toContain('closed');
  });

  it('says so when there are no open events', async () => {
    const { handler, text } = setup({ events: [] });
    const c = text('/edit_event');
    await handler.start(c);
    expect(c.reply.mock.calls[0][0]).toContain('No open events');
  });

  it('treats another chat’s event as not found', async () => {
    const other = { ...setup().event(), chatId: 99 };
    const { handler, text, tap, repo } = setup({ events: [other] });
    await handler.start(text('/edit_event')); // listOpen mock ignores chat; pick is what guards
    const c = tap('edit_pick:EVTREF0001');
    await handler.handleCallback(c);
    expect(c.editMessageText.mock.calls[0][0]).toContain('not found');
    expect(repo.updateEvent).not.toHaveBeenCalled();
  });

  it('ignores taps from someone other than the owner, and cancel leaves the event alone', async () => {
    const { handler, text, tap, repo } = setup();
    await handler.start(text('/edit_event'));
    const other = tap('edit_field:name', 999);
    await handler.handleCallback(other);
    expect(other.answerCallbackQuery).toHaveBeenCalled();
    expect(other.editMessageText).not.toHaveBeenCalled();

    const cancel = tap('edit_cancel');
    await handler.handleCallback(cancel);
    expect(cancel.editMessageText.mock.calls[0][0]).toContain('Cancelled');
    expect(repo.updateEvent).not.toHaveBeenCalled();
  });
});
