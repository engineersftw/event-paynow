import { Api, Context } from 'grammy';
import type { Update, UserFromGetMe } from 'grammy/types';
import { SplitCommandHandler } from '../commands/split-handler';
import { D1UsageRepository } from '../db/usage-repository';
import type { Env } from '../env';
import type { ConversationDO } from '../worker/conversation-do';
import type { InitDataUser } from './init-data';

/**
 * Bot code needs a grammY `Context`, and a Mini App request has none. This builds one as if the
 * organiser had sent a message in their chat and topic (the way the Workflow's delivery does), with
 * a Bot API client for the Split bot, plus the handler that runs on it. Claiming only happens in
 * groups, so a negative chat id is a supergroup.
 */
export function organiserContext(
  env: Env,
  where: { chatId: number; topicId: number; user: InitDataUser },
  store: DurableObjectStub,
  fetchFn?: typeof fetch
): { ctx: Context; handler: SplitCommandHandler } {
  const api = new Api(env.SPLIT_BOT_TOKEN!, fetchFn ? { fetch: fetchFn } : undefined);
  const update = {
    update_id: 0,
    message: {
      message_id: 0,
      date: Math.floor(Date.now() / 1000),
      chat: { id: where.chatId, type: where.chatId < 0 ? 'supergroup' : 'private' },
      from: { is_bot: false, ...where.user },
      ...(where.topicId ? { message_thread_id: where.topicId, is_topic_message: true } : {}),
    },
  } as unknown as Update;
  const me = { id: 0, is_bot: true, first_name: 'Split', username: env.SPLIT_BOT_USERNAME ?? '' };
  const ctx = new Context(update, api, me as UserFromGetMe);
  const handler = new SplitCommandHandler(
    store as unknown as ConversationDO,
    {},
    new D1UsageRepository(env.paynow_db),
    undefined,
    undefined,
    env.SPLIT_BOT_USERNAME && env.SPLIT_APP_NAME
      ? { bot: env.SPLIT_BOT_USERNAME, name: env.SPLIT_APP_NAME }
      : undefined
  );
  return { ctx, handler };
}
