import { z } from 'zod';
import type { Env } from '../env';

/**
 * Durable Object for managing per-chat conversation state.
 * Implements FSM (Finite State Machine) for conversation flows.
 */

// ============================================================================
// Conversation State Schema
// ============================================================================

/**
 * Zod schema for conversation state validation.
 * All state transitions must pass through this schema.
 */
const ConversationStateSchema = z.object({
  // Current conversation flow
  flow: z.enum(['idle', 'init', 'start', 'payback', 'end', 'edit']).default('idle'),

  // Step within the current flow
  step: z.number().int().nonnegative().default(0),

  // Context data for the current conversation
  context: z.record(z.string(), z.any()).default({}),

  // Timestamp of last activity
  lastActivity: z.string().datetime().optional(),

  // Payment reference being processed (if any)
  activePaymentRef: z.string().optional(),

  // Who started the conversation and in which topic (0 = no topic). Only their text continues it.
  // Absent on idle state and on conversations that began before this field existed.
  owner: z.object({ userId: z.number(), topicId: z.number() }).optional(),
});

export type ConversationState = z.infer<typeof ConversationStateSchema>;

// ============================================================================
// Serializer
// ============================================================================

/**
 * Typed serializer for conversation state.
 * Handles serialization/deserialization with validation.
 */
export class ConversationSerializer {
  /**
   * Serialize state to JSON string.
   */
  serialize(state: ConversationState): string {
    return JSON.stringify(state);
  }

  /**
   * Deserialize JSON string to state.
   * Validates the data against the schema.
   * Returns null if validation fails (corrupted data).
   */
  deserialize(json: string): ConversationState | null {
    try {
      const data = JSON.parse(json);
      const result = ConversationStateSchema.safeParse(data);

      if (!result.success) {
        console.error('State validation failed:', result.error);
        return null;
      }

      return result.data;
    } catch (error) {
      console.error('State deserialization failed:', error);
      return null;
    }
  }

  /**
   * Create initial state.
   */
  initialState(): ConversationState {
    return {
      flow: 'idle',
      step: 0,
      context: {},
      lastActivity: new Date().toISOString(),
    };
  }
}

// ============================================================================
// Durable Object
// ============================================================================

/**
 * Conversation Durable Object.
 * Manages conversation state for a single chat.
 */
export class ConversationDO {
  public state: DurableObjectState;
  private serializer: ConversationSerializer;
  private alarmTimeoutMs = 10 * 60 * 1000; // 10 minutes

  // workerd constructs DOs with (state, env); this DO only needs storage,
  // so env is accepted but intentionally unused.
  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    this.serializer = new ConversationSerializer();
  }

  /**
   * Handle incoming requests.
   * Implements get-or-create pattern for conversation state.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // Get current state
    if (method === 'GET' && url.pathname === '/state') {
      return this.getState();
    }

    // Read-only view: no write, no activity bump, no alarm (used to decide whether a message is relevant)
    if (method === 'GET' && url.pathname === '/peek') {
      return this.peekState();
    }

    // Record the owner of the active conversation
    if (method === 'POST' && url.pathname === '/owner') {
      return this.setOwner(request);
    }

    // Update state
    if (method === 'POST' && url.pathname === '/state') {
      return this.updateState(request);
    }

    // Reset state
    if (method === 'POST' && url.pathname === '/reset') {
      return this.resetState();
    }

    // Atomic compare-and-reset (exactly-once confirm taps)
    if (method === 'POST' && url.pathname === '/claim') {
      return this.claimState(request);
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Get current conversation state.
   */
  private async getState(): Promise<Response> {
    const storedValue = await this.state.storage.get<string>('conversation');

    let state: ConversationState;

    if (!storedValue) {
      // No state exists - create initial state
      state = this.serializer.initialState();
      await this.saveState(state);
    } else {
      // storedValue is already the actual object, not a JSON string
      const deserialized = this.serializer.deserialize(storedValue);

      if (!deserialized) {
        // Corrupted state - reset to initial
        console.warn('Corrupted state detected, resetting to initial');
        state = this.serializer.initialState();
        await this.saveState(state);
      } else {
        state = deserialized;
      }
    }

    // Update last activity
    state.lastActivity = new Date().toISOString();
    await this.saveState(state);

    // Schedule alarm for idle expiry
    await this.scheduleAlarm();

    return new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Current state without touching storage: nothing is created or refreshed, so chatter in a
   * chat with no conversation costs a read only and never extends a conversation's expiry.
   */
  private async peekState(): Promise<Response> {
    const stored = await this.state.storage.get<string>('conversation');
    const state =
      (stored ? this.serializer.deserialize(stored) : null) ?? this.serializer.initialState();
    return new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Stamp the owner on the active conversation. A no-op when idle (e.g. the command rejected
   * its input and ended the flow), so an owner never outlives a conversation.
   */
  private async setOwner(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as {
      userId?: unknown;
      topicId?: unknown;
    } | null;
    if (typeof body?.userId !== 'number' || typeof body.topicId !== 'number') {
      return new Response('Invalid owner', { status: 400 });
    }
    const stored = await this.state.storage.get<string>('conversation');
    const current = stored ? this.serializer.deserialize(stored) : null;
    if (!current || current.flow === 'idle') return new Response(null, { status: 204 });
    await this.saveState({ ...current, owner: { userId: body.userId, topicId: body.topicId } });
    return new Response(null, { status: 204 });
  }

  /**
   * Update conversation state.
   */
  private async updateState(request: Request): Promise<Response> {
    try {
      const updates = (await request.json()) as Partial<ConversationState>;
      const currentJson = await this.state.storage.get<string>('conversation');

      let current: ConversationState;

      if (!currentJson) {
        current = this.serializer.initialState();
      } else {
        const deserialized = this.serializer.deserialize(currentJson);
        if (!deserialized) {
          current = this.serializer.initialState();
        } else {
          current = deserialized;
        }
      }

      // Merge updates; an owner never outlives its conversation
      const updated = { ...current, ...updates };
      if (updated.flow === 'idle') delete updated.owner;

      // Validate updated state
      const validated = ConversationStateSchema.parse(updated);

      // Save validated state
      await this.saveState(validated);

      // Update last activity
      validated.lastActivity = new Date().toISOString();
      await this.saveState(validated);

      // Schedule alarm for idle expiry
      await this.scheduleAlarm();

      return new Response(JSON.stringify(validated), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('State update failed:', error);
      return new Response('Invalid state update', { status: 400 });
    }
  }

  /**
   * Reset conversation state to initial.
   */
  private async resetState(): Promise<Response> {
    const state = this.serializer.initialState();
    await this.saveState(state);
    await this.scheduleAlarm();

    return new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Atomically claim the conversation: if the stored state is exactly `{ flow, step }`,
   * reset it to idle and return the previous state (200); otherwise 409. A DO handles one
   * request at a time, so of N concurrent claims exactly one wins — the building block for
   * "tap Confirm twice, create once".
   */
  private async claimState(request: Request): Promise<Response> {
    let expected: { flow?: unknown; step?: unknown };
    try {
      expected = (await request.json()) as { flow?: unknown; step?: unknown };
    } catch {
      return new Response('Invalid claim', { status: 400 });
    }

    const stored = await this.state.storage.get<string>('conversation');
    const current = stored ? this.serializer.deserialize(stored) : null;
    if (!current || current.flow !== expected.flow || current.step !== expected.step) {
      return new Response('Conflict', { status: 409 });
    }

    await this.saveState(this.serializer.initialState());
    await this.scheduleAlarm();
    return new Response(JSON.stringify(current), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * workerd lifecycle callback — invoked when a scheduled alarm fires.
   * Clears conversation state after 10 minutes of inactivity.
   */
  async alarm(): Promise<void> {
    const stateJson = await this.state.storage.get<string>('conversation');

    if (!stateJson) {
      return;
    }

    const state = this.serializer.deserialize(stateJson);

    if (!state) {
      // Corrupted state - clear it
      await this.state.storage.delete('conversation');
      return;
    }

    if (state.lastActivity) {
      const lastActivity = new Date(state.lastActivity).getTime();
      const now = Date.now();

      if (now - lastActivity >= this.alarmTimeoutMs) {
        // Clear state after 10 minutes of inactivity
        await this.state.storage.delete('conversation');
      }
    }
  }

  /**
   * Save state to storage.
   */
  private async saveState(state: ConversationState): Promise<void> {
    const json = this.serializer.serialize(state);
    await this.state.storage.put('conversation', json);
  }

  /**
   * Schedule alarm for idle expiry.
   */
  private async scheduleAlarm(): Promise<void> {
    const scheduledTime = Date.now() + this.alarmTimeoutMs;
    await this.state.storage.setAlarm(scheduledTime);
  }
}

// ============================================================================
// Router
// ============================================================================

/**
 * Get or create a conversation DO for a chat.
 */
export async function getConversationDO(env: Env, chatId: number): Promise<DurableObjectStub> {
  const id = env.CHAT_SESSION.idFromName(`chat-${chatId}`);
  return env.CHAT_SESSION.get(id);
}
