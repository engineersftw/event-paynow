import { describe, expect, it, vi } from 'vitest';
import { EndEventHandler } from '../../src/commands/end-event-handler';
import type { Event, EventRepository } from '../../src/db/repository';
import type { ConversationDO } from '../../src/worker/conversation-do';

const event = (chatId: number): Event => ({
  id: 1,
  ref: 'EVTREF0001',
  chatId,
  topicId: 0,
  name: 'Dinner',
  payeeType: 'mobile',
  payeeValue: '+6591234567',
  status: 'open',
  createdAt: '2024-01-01T00:00:00Z',
  closedAt: null,
});

function setup(eventChatId: number, callerChatId: number) {
  const repo = {
    getEventByRef: vi.fn(async () => event(eventChatId)),
    getEventStats: vi.fn(async () => ({
      paymentCount: 2,
      collectedCents: 500,
      paidBackCents: 300,
      pendingCents: 0,
    })),
    closeEvent: vi.fn(async () => true),
  } as unknown as EventRepository;
  const doStub = {
    fetch: vi.fn(async () => ({
      status: 200,
      json: async () => ({ flow: 'end', step: 2, context: {} }),
      body: null,
    })),
  } as unknown as ConversationDO;
  const ctx = (data: string) =>
    ({
      chat: { id: callerChatId },
      callbackQuery: { data },
      answerCallbackQuery: vi.fn(),
      editMessageText: vi.fn(),
      reply: vi.fn(),
    }) as never;
  return { repo, handler: new EndEventHandler(doStub, repo), ctx };
}

describe('EndEventHandler chat check', () => {
  it('confirm closes an event of the same chat', async () => {
    const { repo, handler, ctx } = setup(10, 10);
    const c = ctx('end_confirm:EVTREF0001');
    await handler.handleCallback(c);
    expect(repo.closeEvent).toHaveBeenCalledWith('EVTREF0001', expect.any(String));
    expect((c as any).editMessageText.mock.calls[0][0]).toContain('closed');
    const summary = (c as any).editMessageText.mock.calls[0][0] as string;
    expect(summary).toContain('Collected: $5.00');
    expect(summary).toContain('Paid back: $3.00');
  });

  it('confirm on another chat’s event does not close it and reads as not found', async () => {
    const { repo, handler, ctx } = setup(10, 99);
    const c = ctx('end_confirm:EVTREF0001');
    await handler.handleCallback(c);
    expect(repo.closeEvent).not.toHaveBeenCalled();
    expect(repo.getEventStats).not.toHaveBeenCalled();
    expect((c as any).editMessageText.mock.calls[0][0]).toContain('not found');
  });

  it('pick on another chat’s event shows no confirm step', async () => {
    const { repo, handler, ctx } = setup(10, 99);
    const c = ctx('end_pick:EVTREF0001');
    await handler.handleCallback(c);
    expect(repo.getEventStats).not.toHaveBeenCalled();
    expect((c as any).answerCallbackQuery.mock.calls[0][0].text).toContain('not found');
  });
});
