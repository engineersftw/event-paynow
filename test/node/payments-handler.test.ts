import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsCommandHandler } from '../../src/commands/payments-handler';
import type { EventRepository, Payment, Repository, User } from '../../src/db/repository';

describe('PaymentsCommandHandler', () => {
  let handler: PaymentsCommandHandler;
  let mockRepository: Repository;
  let mockEventRepository: EventRepository;
  let mockCtx: any;

  const _user: User = {
    telegramId: 123456789,
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    displayName: 'Test User',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const openEvent = {
    id: 1,
    ref: 'EVT-TEST0001',
    chatId: 123456789,
    topicId: 0,
    name: 'Test Event',
    payeeType: 'mobile' as const,
    payeeValue: '+6591234567',
    status: 'open' as const,
    createdAt: '2024-01-01T00:00:00Z',
    closedAt: null,
  };

  beforeEach(() => {
    mockRepository = {
      getUser: vi.fn(),
      listPaymentsByUser: vi.fn(),
      getPaymentByRef: vi.fn(),
      updatePaymentStatus: vi.fn(),
    } as unknown as Repository;

    mockEventRepository = {
      listAllEventsByChat: vi.fn(),
      getEventByRef: vi.fn(),
      getEventStats: vi.fn(),
      listOpenEventsByChat: vi.fn(),
      createEvent: vi.fn(),
      closeEvent: vi.fn(),
    } as unknown as EventRepository;

    mockCtx = {
      from: { id: 123456789 },
      chat: { id: 123456789 },
      reply: vi.fn(),
    };

    handler = new PaymentsCommandHandler(mockRepository, mockEventRepository);
  });

  describe('handle', () => {
    it('should show empty message when no events exist', async () => {
      vi.mocked(mockEventRepository.listAllEventsByChat).mockResolvedValue([]);

      await handler.handle(mockCtx);

      expect(mockEventRepository.listAllEventsByChat).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining("don't have any events yet")
      );
    });

    it('should display events list with stats', async () => {
      vi.mocked(mockEventRepository.listAllEventsByChat).mockResolvedValue([openEvent as any]);
      vi.mocked(mockEventRepository.getEventStats).mockResolvedValue({
        paymentCount: 2,
        collectedCents: 550,
        pendingCents: 1500,
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Test Event'),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
      const message = vi.mocked(mockCtx.reply).mock.calls[0]![0] as string;
      expect(message).toContain('2 payments');
      expect(message).toContain('$5.50 collected');
      expect(message).toContain('$15.00 pending');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockEventRepository.listAllEventsByChat).mockRejectedValue(new Error('DB error'));

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        '❌ Failed to fetch your payments. Please try again later.'
      );
    });
  });

  describe('showEventPayments (via event_view callback)', () => {
    it('should show payments for a specific event', async () => {
      const payment: Payment = {
        id: 1,
        ref: 'PAY001',
        userId: 123456789,
        eventId: 1,
        description: 'Lunch',
        amountCents: 1500,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'pending',
        source: 'manual',
        qrPayload: 'payload1',
        createdAt: '2024-01-15T12:30:00Z',
        receivedAt: null,
      };

      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue(openEvent as any);
      vi.mocked(mockRepository.listPaymentsByUser).mockResolvedValue([payment]);

      await handler.handle(mockCtx, 'EVT-TEST0001');

      expect(mockEventRepository.getEventByRef).toHaveBeenCalledWith('EVT-TEST0001');
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Lunch'),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
    });

    it('escapes Markdown specials in the event name and description', async () => {
      const payment: Payment = {
        id: 1,
        ref: 'PAY001',
        userId: 123456789,
        eventId: 1,
        description: 'Sam_s *dinner*',
        amountCents: 1500,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'pending',
        source: 'manual',
        qrPayload: 'p',
        createdAt: '2024-01-15T12:30:00Z',
        receivedAt: null,
      };
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue({
        ...openEvent,
        name: 'Sam_s *dinner*',
      } as any);
      vi.mocked(mockRepository.listPaymentsByUser).mockResolvedValue([payment]);

      await handler.handle(mockCtx, 'EVT-TEST0001');

      const text = vi.mocked(mockCtx.reply).mock.calls[0]![0] as string;
      expect(text).toContain('*Sam\\_s \\*dinner\\**');
      expect(text).toContain('Sam\\_s \\*dinner\\*');
    });

    it('shows the (escaped) payer name in list entries and nothing extra without one', async () => {
      const base: Payment = {
        id: 1,
        ref: 'PAY001',
        userId: 123456789,
        eventId: 1,
        description: 'Lunch',
        amountCents: 1500,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'pending',
        source: 'manual',
        qrPayload: 'payload1',
        createdAt: '2024-01-15T12:30:00Z',
        receivedAt: null,
      };
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue(openEvent as any);
      vi.mocked(mockRepository.listPaymentsByUser).mockResolvedValue([
        { ...base, payerName: 'Al_ice' },
        { ...base, id: 2, ref: 'PAY002', createdAt: '2024-01-14T12:30:00Z' },
      ]);

      await handler.handle(mockCtx, 'EVT-TEST0001');

      const text = vi.mocked(mockCtx.reply).mock.calls[0]![0] as string;
      expect(text).toContain('*$15.00* - Lunch (Al\\_ice)');
      expect(text).toContain('*$15.00* - Lunch\n');
    });

    it('lists voided payments as view-only and offers Payback only for received ones', async () => {
      const base: Payment = {
        id: 1,
        ref: 'PAYP',
        userId: 123456789,
        eventId: 1,
        description: 'Lunch',
        amountCents: 1500,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'pending',
        source: 'manual',
        qrPayload: 'payload1',
        createdAt: '2024-01-15T12:30:00Z',
        receivedAt: null,
      };
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue(openEvent as any);
      vi.mocked(mockRepository.listPaymentsByUser).mockResolvedValue([
        { ...base, ref: 'PAYP', createdAt: '2024-01-15T12:30:00Z' },
        { ...base, id: 2, ref: 'PAYR', status: 'received', createdAt: '2024-01-14T12:30:00Z' },
        { ...base, id: 3, ref: 'PAYV', status: 'voided', createdAt: '2024-01-13T12:30:00Z' },
      ]);

      await handler.handle(mockCtx, 'EVT-TEST0001');

      const [text, opts] = vi.mocked(mockCtx.reply).mock.calls[0]! as [
        string,
        { reply_markup: { inline_keyboard: Array<Array<{ callback_data: string }>> } },
      ];
      expect(text).toContain('⏳ *$15.00*');
      expect(text).toContain('Ref: `PAYV` | Voided');
      expect(text).toContain('🚫 *$15.00*');
      const rows = opts.reply_markup.inline_keyboard
        .map((r) => r.map((b) => b.callback_data))
        .filter((r) => r.length > 0); // grammY leaves a trailing empty row
      expect(rows).toEqual([
        ['view:PAYP', 'mark_received:PAYP'],
        ['view:PAYR', 'payback:PAYR'],
        ['view:PAYV'],
      ]);
    });

    it('should show empty message when event has no payments', async () => {
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue(openEvent as any);
      vi.mocked(mockRepository.listPaymentsByUser).mockResolvedValue([]);

      await handler.handle(mockCtx, 'EVT-TEST0001');

      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('No payments for event'));
    });

    it('should handle non-existent event', async () => {
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue(null);

      await handler.handle(mockCtx, 'EVT-NONEXISTENT');

      expect(mockCtx.reply).toHaveBeenCalledWith('❌ Event not found.');
    });
  });
});
