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
