import { describe, expect, it, vi } from 'vitest';
import { PaybackCommandHandler } from '../../src/commands/payback-handler';
import { PaymentCallbackHandler } from '../../src/commands/payment-callback-handler';
import { PaymentsCommandHandler } from '../../src/commands/payments-handler';
import type { Event, EventRepository, Payment, Repository } from '../../src/db/repository';
import type { ConversationDO } from '../../src/worker/conversation-do';

const ADMIN = 555;
const OWNER = 111;
const allow = async () => true;
const deny = async () => false;

const payment = (over: Partial<Payment> = {}): Payment => ({
  id: 1,
  ref: 'PAY123',
  userId: OWNER,
  eventId: 7,
  description: 'Dinner',
  amountCents: 2000,
  payeeType: 'mobile',
  payeeValue: '+6591110000',
  status: 'pending',
  source: 'manual',
  qrPayload: 'p',
  payerType: 'mobile',
  payerValue: '+6598887777',
  payerName: 'Alice',
  createdAt: '2024-01-01T00:00:00Z',
  receivedAt: null,
  ...over,
});

function ctx(data: string, from = ADMIN) {
  return {
    from: { id: from },
    chat: { id: -100 },
    callbackQuery: { data, message: { chat: { id: -100 }, message_id: 5, photo: [{}] } },
    answerCallbackQuery: vi.fn(),
    editMessageText: vi.fn(),
    reply: vi.fn(),
    api: { deleteMessage: vi.fn() },
  } as never;
}

function repoWith(p: Payment) {
  return {
    getPaymentByRef: vi.fn(async () => p),
    updatePaymentStatus: vi.fn(async () => ({ ...p, status: 'received' })),
    voidPayment: vi.fn(async () => ({ ...p, status: 'voided' })),
    listPaybacksByPayment: vi.fn(async () => []),
    sumPaybacks: vi.fn(async () => 0),
    getPaybackByRef: vi.fn(async () => ({
      id: 1,
      ref: 'PB1',
      paymentId: 1,
      payerType: 'mobile',
      payerValue: '+6598887777',
      amountCents: 500,
      status: 'pending',
      qrPayload: 'p',
      createdAt: '2024-01-01T00:00:00Z',
      sentAt: null,
    })),
    updatePaybackStatus: vi.fn(async (ref: string, status: string) => ({
      id: 1,
      ref,
      paymentId: 1,
      payerType: 'mobile',
      payerValue: '+6598887777',
      amountCents: 500,
      status,
      qrPayload: 'p',
      createdAt: '2024-01-01T00:00:00Z',
      sentAt: null,
    })),
  };
}

const doStub = {
  fetch: vi.fn(async () => ({
    status: 200,
    json: async () => ({ flow: 'idle', step: 0, context: {} }),
    body: null,
  })),
} as unknown as ConversationDO;

describe('chat admins acting on another user’s payment (callbacks)', () => {
  it('an admin marks it received and is recorded as the actor', async () => {
    const repo = repoWith(payment());
    const c = ctx('mark_received:PAY123');
    await new PaymentCallbackHandler(doStub, repo as unknown as Repository, allow).handleCallback(
      c
    );
    expect(repo.updatePaymentStatus).toHaveBeenCalledWith(
      'PAY123',
      'received',
      'manual',
      expect.any(String),
      ADMIN
    );
  });

  it('an admin voids it and is recorded as the actor', async () => {
    const repo = repoWith(payment());
    await new PaymentCallbackHandler(doStub, repo as unknown as Repository, allow).handleCallback(
      ctx('void:PAY123')
    );
    expect(repo.voidPayment).toHaveBeenCalledWith('PAY123', ADMIN);
  });

  it('an admin marks a payback sent and cancels another, each recorded', async () => {
    const repo = repoWith(payment({ status: 'received' }));
    const h = new PaymentCallbackHandler(doStub, repo as unknown as Repository, allow);
    await h.handleCallback(ctx('pb_sent:PAY123:PB1'));
    await h.handleCallback(ctx('pb_cancel:PAY123:PB1'));
    expect(repo.updatePaybackStatus).toHaveBeenCalledWith('PB1', 'sent', expect.any(String), ADMIN);
    expect(repo.updatePaybackStatus).toHaveBeenCalledWith(
      'PB1',
      'cancelled',
      expect.any(String),
      ADMIN
    );
  });

  it('a non-admin is refused with the existing message and nothing changes', async () => {
    const repo = repoWith(payment());
    const c = ctx('void:PAY123');
    await new PaymentCallbackHandler(doStub, repo as unknown as Repository, deny).handleCallback(c);
    expect(
      (c as never as { answerCallbackQuery: ReturnType<typeof vi.fn> }).answerCallbackQuery
    ).toHaveBeenCalledWith({
      text: '❌ You do not own this payment',
    });
    expect(repo.voidPayment).not.toHaveBeenCalled();
  });

  it('by default (no access function) only the owner may act', async () => {
    const repo = repoWith(payment());
    await new PaymentCallbackHandler(doStub, repo as unknown as Repository).handleCallback(
      ctx('void:PAY123')
    );
    expect(repo.voidPayment).not.toHaveBeenCalled();
    await new PaymentCallbackHandler(doStub, repo as unknown as Repository).handleCallback(
      ctx('void:PAY123', OWNER)
    );
    expect(repo.voidPayment).toHaveBeenCalledWith('PAY123', OWNER);
  });
});

describe('/payback <ref> by an admin', () => {
  it('starts the flow for another user’s received payment; a member is refused', async () => {
    const repo = repoWith(payment({ status: 'received' }));
    const admin = ctx('', ADMIN) as never as { reply: ReturnType<typeof vi.fn> };
    await new PaybackCommandHandler(doStub, repo as unknown as Repository, allow).start(
      admin as never,
      'PAY123'
    );
    expect(admin.reply.mock.calls[0]![0]).not.toContain('do not own');

    const member = ctx('', 222) as never as { reply: ReturnType<typeof vi.fn> };
    await new PaybackCommandHandler(doStub, repo as unknown as Repository, deny).start(
      member as never,
      'PAY123'
    );
    expect(member.reply).toHaveBeenCalledWith('❌ You do not own this payment.');
  });
});

describe('/payments drill-down for admins', () => {
  const event = { id: 7, ref: 'EVT1', chatId: -100, name: 'Dinner' } as Event;
  const others = [
    payment({ id: 1, ref: 'MINE000001', userId: ADMIN }),
    payment({ id: 2, ref: 'THEIRS0002', userId: OWNER }),
  ];

  function setup(isAdmin: (c: number, u: number) => Promise<boolean>) {
    const repo = {
      listPaymentsByUser: vi.fn(async () => [others[0]!]),
      listPaymentsByEvent: vi.fn(async () => others),
      sentPaybackTotalsByEvent: vi.fn(async () => new Map()),
    } as unknown as Repository;
    const events = { getEventByRef: vi.fn(async () => event) } as unknown as EventRepository;
    const c = ctx('');
    return {
      c,
      run: () => new PaymentsCommandHandler(repo, events, isAdmin).handle(c, 'EVT1'),
      repo,
    };
  }

  it('an admin sees every payment of the event', async () => {
    const { c, run, repo } = setup(allow);
    await run();
    const text = (c as never as { reply: ReturnType<typeof vi.fn> }).reply.mock
      .calls[0]![0] as string;
    expect(text).toContain('MINE000001');
    expect(text).toContain('THEIRS0002');
    expect(repo.listPaymentsByUser).not.toHaveBeenCalled();
  });

  it('an ordinary member only sees their own', async () => {
    const { c, run } = setup(deny);
    await run();
    const text = (c as never as { reply: ReturnType<typeof vi.fn> }).reply.mock
      .calls[0]![0] as string;
    expect(text).toContain('MINE000001');
    expect(text).not.toContain('THEIRS0002');
  });
});
