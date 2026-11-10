import { beforeEach, describe, expect, it } from 'vitest';
import {
  ConversationDO,
  ConversationSerializer,
  type ConversationState,
} from '../../src/worker/conversation-do';

/**
 * Test Durable Object state implementation.
 */
class MockDurableObjectState {
  storage: MockStorage;

  constructor() {
    this.storage = new MockStorage();
  }
}

class MockStorage {
  private storage = new Map<string, any>();
  private alarm: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.storage.get(key);
    return value as T | undefined;
  }

  async put(key: string, value: any): Promise<void> {
    this.storage.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async setAlarm(scheduledTime: number): Promise<void> {
    this.alarm = scheduledTime;
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }

  // Helper to simulate alarm trigger
  async triggerAlarm(): Promise<void> {
    if (this.alarm && Date.now() >= this.alarm) {
      this.alarm = null;
    }
  }
}

/**
 * Mock environment.
 */
const mockEnv = {} as any;

describe('ConversationDO', () => {
  let mockState: MockDurableObjectState;
  let conversationDO: ConversationDO;

  beforeEach(() => {
    mockState = new MockDurableObjectState();
    conversationDO = new ConversationDO(mockState as any, mockEnv);
  });

  describe('get-or-create pattern', () => {
    it('should create initial state when none exists', async () => {
      const request = new Request('http://localhost/state', { method: 'GET' });
      const response = await conversationDO.fetch(request);

      expect(response.status).toBe(200);

      const state = await response.json();
      expect(state).toMatchObject({
        flow: 'idle',
        step: 0,
        context: {},
      });
      expect(state.lastActivity).toBeDefined();
    });

    it('should return existing state if already created', async () => {
      // Create initial state
      const request1 = new Request('http://localhost/state', { method: 'GET' });
      const response1 = await conversationDO.fetch(request1);
      const state1 = await response1.json();

      // Get state again
      const request2 = new Request('http://localhost/state', { method: 'GET' });
      const response2 = await conversationDO.fetch(request2);
      const state2 = await response2.json();

      // Should be the same state (flow and step)
      expect(state2.flow).toBe(state1.flow);
      expect(state2.step).toBe(state1.step);
    });
  });

  describe('state serialization', () => {
    it('should serialize and deserialize state correctly', async () => {
      const serializer = new ConversationSerializer();

      const state: ConversationState = {
        flow: 'start',
        step: 2,
        context: { description: 'Test payment', amount: 1000 },
        lastActivity: new Date().toISOString(),
        activePaymentRef: 'ABC123',
      };

      const serialized = serializer.serialize(state);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized).toEqual(state);
    });

    it('should handle state with all fields', async () => {
      const serializer = new ConversationSerializer();

      const state: ConversationState = {
        flow: 'payback',
        step: 5,
        context: { payer: '+6591234567', amount: 5000 },
        lastActivity: new Date().toISOString(),
        activePaymentRef: 'XYZ789',
      };

      const serialized = serializer.serialize(state);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized).toEqual(state);
    });
  });

  describe('schema validation', () => {
    it('should reject corrupted state data', async () => {
      const serializer = new ConversationSerializer();

      // Manually corrupt the stored state
      const corruptedData = JSON.stringify({
        flow: 'invalid-flow', // Not in enum
        step: -1, // Negative step
        context: 'not-an-object', // Wrong type
      });

      const deserialized = serializer.deserialize(corruptedData);
      expect(deserialized).toBeNull();
    });

    it('should reject invalid JSON', async () => {
      const serializer = new ConversationSerializer();

      const deserialized = serializer.deserialize('not-valid-json');
      expect(deserialized).toBeNull();
    });

    it('should reset to initial state when corrupted data is detected', async () => {
      // Manually inject corrupted state (as JSON string, matching real behavior)
      const corruptedData = JSON.stringify({
        flow: 'invalid',
        step: -1,
        context: 'corrupted',
      });
      await conversationDO.state.storage.put('conversation', corruptedData);

      // Try to get state - should detect corruption and reset
      const request = new Request('http://localhost/state', { method: 'GET' });
      const response = await conversationDO.fetch(request);

      expect(response.status).toBe(200);

      const state = await response.json();
      expect(state.flow).toBe('idle');
      expect(state.step).toBe(0);
    });

    it('should reject state update with invalid flow', async () => {
      const request = new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify({ flow: 'invalid-flow' }),
      });

      const response = await conversationDO.fetch(request);
      expect(response.status).toBe(400);
    });

    it('should reject state update with negative step', async () => {
      const request = new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify({ step: -1 }),
      });

      const response = await conversationDO.fetch(request);
      expect(response.status).toBe(400);
    });
  });

  describe('revision check and idle limit', () => {
    const post = (body: unknown) =>
      conversationDO.fetch(
        new Request('http://localhost/state', { method: 'POST', body: JSON.stringify(body) })
      );
    const read = async () =>
      (await (await conversationDO.fetch(new Request('http://localhost/state'))).json()) as {
        rev?: number;
        context: Record<string, unknown>;
      };

    it('accepts a write that expects the current revision and refuses a stale one', async () => {
      await post({ flow: 'split', step: 1, context: { n: 1 } });
      const first = await read();
      expect(first.rev).toBe(1);

      expect((await post({ flow: 'split', step: 1, context: { n: 2 }, ifRev: 1 })).status).toBe(
        200
      );
      // the same expectation again is now stale: nothing is written
      const stale = await post({ flow: 'split', step: 1, context: { n: 3 }, ifRev: 1 });
      expect(stale.status).toBe(409);
      const after = await read();
      expect(after.context.n).toBe(2);
      expect(after.rev).toBe(2);
    });

    it('keeps a conversation with a one hour limit past ten minutes and expires it after the hour', async () => {
      const at = (minutes: number): ConversationState => ({
        flow: 'split',
        step: 17,
        context: {},
        idleMs: 60 * 60 * 1000,
        lastActivity: new Date(Date.now() - minutes * 60 * 1000).toISOString(),
      });
      await conversationDO.state.storage.put('conversation', JSON.stringify(at(30)));
      await conversationDO.alarm();
      expect(await conversationDO.state.storage.get('conversation')).toBeDefined();

      await conversationDO.state.storage.put('conversation', JSON.stringify(at(61)));
      await conversationDO.alarm();
      expect(await conversationDO.state.storage.get('conversation')).toBeUndefined();
    });

    it('schedules the alarm one hour ahead for such a conversation', async () => {
      await post({ flow: 'split', step: 17, context: {}, idleMs: 60 * 60 * 1000 });
      await read();
      const alarm = (await conversationDO.state.storage.getAlarm())!;
      expect(alarm).toBeGreaterThan(Date.now() + 59 * 60 * 1000);
    });
  });

  describe('alarm handling', () => {
    it('should schedule alarm after state access', async () => {
      const request = new Request('http://localhost/state', { method: 'GET' });
      await conversationDO.fetch(request);

      const alarm = await conversationDO.state.storage.getAlarm();
      expect(alarm).not.toBeNull();

      // Alarm should be ~10 minutes in the future
      const now = Date.now();
      const tenMinutes = 10 * 60 * 1000;
      expect(alarm).toBeGreaterThan(now + tenMinutes - 1000);
      expect(alarm).toBeLessThan(now + tenMinutes + 1000);
    });

    it('should clear state after 10 minutes of inactivity', async () => {
      // Create initial state with old lastActivity timestamp
      const oldState: ConversationState = {
        flow: 'idle',
        step: 0,
        context: {},
        lastActivity: new Date(Date.now() - 11 * 60 * 1000).toISOString(), // 11 minutes ago
      };
      await conversationDO.state.storage.put('conversation', JSON.stringify(oldState));

      // Set alarm for 10 minutes from now (already passed)
      const alarmTime = Date.now() - 1 * 60 * 1000; // 1 minute ago
      await conversationDO.state.storage.setAlarm(alarmTime);

      // Trigger alarm directly — workerd calls `alarm()` as a lifecycle
      // callback; there's no fetch route for it.
      await conversationDO.state.storage.triggerAlarm();
      await conversationDO.alarm();

      // Check if state was cleared
      const stateJson = await conversationDO.state.storage.get<string>('conversation');
      expect(stateJson).toBeUndefined();
    });

    it('should not clear state if activity is recent', async () => {
      // Create state with recent activity
      const state: ConversationState = {
        flow: 'start',
        step: 1,
        context: {},
        lastActivity: new Date().toISOString(),
      };
      await conversationDO.state.storage.put('conversation', JSON.stringify(state));

      // Set alarm for 10 minutes from now
      const alarmTime = Date.now() + 10 * 60 * 1000;
      await conversationDO.state.storage.setAlarm(alarmTime);

      // Trigger alarm immediately (before 10 minutes)
      await conversationDO.state.storage.triggerAlarm();
      await conversationDO.alarm();

      // State should still exist
      const stateJson = await conversationDO.state.storage.get<string>('conversation');
      expect(stateJson).toBeDefined();
    });
  });

  describe('state updates', () => {
    it('should update state with POST request', async () => {
      // Create initial state
      const request1 = new Request('http://localhost/state', { method: 'GET' });
      await conversationDO.fetch(request1);

      // Update state
      const request2 = new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify({
          flow: 'start',
          step: 1,
          context: { description: 'Test' },
        }),
      });

      const response = await conversationDO.fetch(request2);
      expect(response.status).toBe(200);

      const updatedState = await response.json();
      expect(updatedState.flow).toBe('start');
      expect(updatedState.step).toBe(1);
      expect(updatedState.context.description).toBe('Test');
    });

    it('should merge updates with existing state', async () => {
      // Create initial state
      const request1 = new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify({
          flow: 'init',
          step: 0,
          context: { proxy: '+6591234567' },
        }),
      });
      await conversationDO.fetch(request1);

      // Update only step and context
      const request2 = new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify({
          step: 1,
          context: { proxy: '+6591234567', confirmed: true },
        }),
      });

      const response = await conversationDO.fetch(request2);
      const updatedState = await response.json();

      // Flow should be preserved
      expect(updatedState.flow).toBe('init');
      expect(updatedState.step).toBe(1);
      expect(updatedState.context.confirmed).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset state to initial', async () => {
      // Create and update state
      const request1 = new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify({
          flow: 'payback',
          step: 5,
          context: { amount: 10000 },
        }),
      });
      await conversationDO.fetch(request1);

      // Reset state
      const request2 = new Request('http://localhost/reset', { method: 'POST' });
      const response = await conversationDO.fetch(request2);

      expect(response.status).toBe(200);

      const state = await response.json();
      expect(state.flow).toBe('idle');
      expect(state.step).toBe(0);
      expect(state.context).toEqual({});
    });
  });

  describe('claim (atomic compare-and-reset)', () => {
    const post = (path: string, body: unknown) =>
      conversationDO.fetch(
        new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) })
      );
    const seed = (flow: string, step: number, context: Record<string, unknown> = {}) =>
      post('/state', { flow, step, context });

    it('succeeds when flow and step match, returns the previous state and resets to idle', async () => {
      await seed('start', 5, { amountCents: 1250 });

      const res = await post('/claim', { flow: 'start', step: 5 });

      expect(res.status).toBe(200);
      const previous = (await res.json()) as ConversationState;
      expect(previous.flow).toBe('start');
      expect(previous.context.amountCents).toBe(1250);

      const after = (await (
        await conversationDO.fetch(new Request('http://localhost/state', { method: 'GET' }))
      ).json()) as ConversationState;
      expect(after.flow).toBe('idle');
      expect(after.step).toBe(0);
      expect(after.context).toEqual({});
    });

    it('returns 409 on a repeat claim', async () => {
      await seed('start', 5);
      expect((await post('/claim', { flow: 'start', step: 5 })).status).toBe(200);
      expect((await post('/claim', { flow: 'start', step: 5 })).status).toBe(409);
    });

    it('returns 409 and leaves state untouched on a flow or step mismatch', async () => {
      await seed('start', 4, { keep: true });

      expect((await post('/claim', { flow: 'start', step: 5 })).status).toBe(409);
      expect((await post('/claim', { flow: 'payback', step: 4 })).status).toBe(409);

      const state = (await (
        await conversationDO.fetch(new Request('http://localhost/state', { method: 'GET' }))
      ).json()) as ConversationState;
      expect(state.flow).toBe('start');
      expect(state.step).toBe(4);
      expect(state.context.keep).toBe(true);
    });

    it('returns 409 when no state has ever been stored, and 400 on a malformed body', async () => {
      expect((await post('/claim', { flow: 'start', step: 5 })).status).toBe(409);
      const bad = await conversationDO.fetch(
        new Request('http://localhost/claim', { method: 'POST', body: 'not json' })
      );
      expect(bad.status).toBe(400);
    });
  });

  describe('concurrent access', () => {
    it('should serialize concurrent state updates', async () => {
      // Create initial state
      const request1 = new Request('http://localhost/state', { method: 'GET' });
      await conversationDO.fetch(request1);

      // Send multiple concurrent updates
      const updates = [
        { step: 1, context: { update: 'first' } },
        { step: 2, context: { update: 'second' } },
        { step: 3, context: { update: 'third' } },
      ];

      const promises = updates.map((update) => {
        const request = new Request('http://localhost/state', {
          method: 'POST',
          body: JSON.stringify(update),
        });
        return conversationDO.fetch(request);
      });

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      // Final state should reflect last update
      const finalRequest = new Request('http://localhost/state', { method: 'GET' });
      const finalResponse = await conversationDO.fetch(finalRequest);
      const finalState = await finalResponse.json();

      expect(finalState.step).toBe(3);
      expect(finalState.context.update).toBe('third');
    });
  });
});

describe('ConversationSerializer', () => {
  let serializer: ConversationSerializer;

  beforeEach(() => {
    serializer = new ConversationSerializer();
  });

  describe('initialState', () => {
    it('should create valid initial state', () => {
      const state = serializer.initialState();

      expect(state.flow).toBe('idle');
      expect(state.step).toBe(0);
      expect(state.context).toEqual({});
      expect(state.lastActivity).toBeDefined();
    });
  });

  describe('serialize', () => {
    it('should serialize state to JSON string', () => {
      const state: ConversationState = {
        flow: 'start',
        step: 1,
        context: { test: 'data' },
        lastActivity: new Date().toISOString(),
      };

      const serialized = serializer.serialize(state);

      expect(typeof serialized).toBe('string');
      expect(() => JSON.parse(serialized)).not.toThrow();
    });
  });

  describe('deserialize', () => {
    it('should deserialize valid JSON to state', () => {
      const state: ConversationState = {
        flow: 'payback',
        step: 2,
        context: { amount: 5000 },
        lastActivity: new Date().toISOString(),
        activePaymentRef: 'ABC123',
      };

      const serialized = serializer.serialize(state);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized).toEqual(state);
    });

    it('should return null for invalid JSON', () => {
      const result = serializer.deserialize('invalid json');
      expect(result).toBeNull();
    });

    it('should return null for invalid schema', () => {
      const invalidState = JSON.stringify({
        flow: 'invalid',
        step: -1,
      });

      const result = serializer.deserialize(invalidState);
      expect(result).toBeNull();
    });

    it('should handle missing optional fields', () => {
      const state = JSON.stringify({
        flow: 'idle',
        step: 0,
        context: {},
        // lastActivity is optional
      });

      const result = serializer.deserialize(state);
      expect(result).not.toBeNull();
      expect(result!.flow).toBe('idle');
    });
  });
});

describe('ConversationDO owner', () => {
  let mockState: MockDurableObjectState;
  let conversationDO: ConversationDO;

  const post = (path: string, body: unknown) =>
    conversationDO.fetch(
      new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) })
    );
  const peek = async () =>
    (await (
      await conversationDO.fetch(new Request('http://localhost/peek'))
    ).json()) as ConversationState;

  beforeEach(() => {
    mockState = new MockDurableObjectState();
    conversationDO = new ConversationDO(mockState as any, mockEnv);
  });

  it('stamps the owner on an active conversation and keeps it across step updates', async () => {
    await post('/state', { flow: 'start', step: 1, context: {} });
    expect((await post('/owner', { userId: 7, topicId: 3 })).status).toBe(204);
    expect((await peek()).owner).toEqual({ userId: 7, topicId: 3 });

    await post('/state', { flow: 'start', step: 2, context: { eventRef: 'E' } }); // no owner given
    const state = await peek();
    expect(state.step).toBe(2);
    expect(state.owner).toEqual({ userId: 7, topicId: 3 });
  });

  it('a new command restamps; the owner is dropped when the flow ends', async () => {
    await post('/state', { flow: 'init', step: 1, context: {} });
    await post('/owner', { userId: 7, topicId: 0 });
    await post('/owner', { userId: 8, topicId: 0 }); // someone else starts a new flow
    expect((await peek()).owner).toEqual({ userId: 8, topicId: 0 });

    await post('/state', { flow: 'idle', step: 0, context: {} });
    expect((await peek()).owner).toBeUndefined();
  });

  it('ignores /owner when idle, rejects a malformed body, and clears on /claim and /reset', async () => {
    expect((await post('/owner', { userId: 7, topicId: 0 })).status).toBe(204);
    expect((await peek()).owner).toBeUndefined();
    expect((await post('/owner', { userId: 'x' })).status).toBe(400);

    await post('/state', { flow: 'start', step: 4, context: {} });
    await post('/owner', { userId: 7, topicId: 0 });
    expect((await post('/claim', { flow: 'start', step: 4 })).status).toBe(200);
    expect((await peek()).owner).toBeUndefined();

    await post('/state', { flow: 'init', step: 1, context: {} });
    await post('/owner', { userId: 7, topicId: 0 });
    await post('/reset', {});
    expect((await peek()).owner).toBeUndefined();
  });

  it('/peek is read-only: it creates nothing and sets no alarm', async () => {
    expect((await peek()).flow).toBe('idle');
    expect(await mockState.storage.get('conversation')).toBeUndefined();
    expect(await mockState.storage.getAlarm()).toBeNull();
  });

  it('a stored state without an owner (older conversations) still parses', () => {
    const state = new ConversationSerializer().deserialize(
      JSON.stringify({ flow: 'init', step: 1, context: {} })
    );
    expect(state?.owner).toBeUndefined();
  });
});
