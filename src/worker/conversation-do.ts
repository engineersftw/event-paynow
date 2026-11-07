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
  flow: z.enum(['idle', 'init', 'start', 'payback', 'end']).default('idle'),

  // Step within the current flow
  step: z.number().int().nonnegative().default(0),

  // Context data for the current conversation
  context: z.record(z.string(), z.any()).default({}),

  // Timestamp of last activity
  lastActivity: z.string().datetime().optional(),

  // Payment reference being processed (if any)
  activePaymentRef: z.string().optional(),
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

    // Update state
    if (method === 'POST' && url.pathname === '/state') {
      return this.updateState(request);
    }

    // Reset state
    if (method === 'POST' && url.pathname === '/reset') {
      return this.resetState();
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

      // Merge updates
      const updated = { ...current, ...updates };

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
