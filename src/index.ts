import { ConversationDO } from './worker/conversation-do';

export { default } from './worker';
/**
 * Worker entry + Durable Object exports.
 *
 * `ChatSessionDO` is the class name registered in `wrangler.toml`
 * ([durable_objects] binding `CHAT_SESSION`). The FSM implementation lives in
 * `src/worker/conversation-do.ts` (task 3.5); it is exported here under the
 * registered name so the deployed binding serves real conversation state.
 */
export { ConversationDO as ChatSessionDO };
