import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { Api, Context } from 'grammy';
import type { Update, UserFromGetMe } from 'grammy/types';
import { SplitCommandHandler } from './commands/split-handler';
import { D1UsageRepository } from './db/usage-repository';
import type { Env } from './env';
import {
  type AiJobResult,
  failureResult,
  readScan,
  readVoice,
  type SplitAiParams,
} from './split-ai-job';
import { splitReaders } from './split-bot';
import type { ConversationDO, ConversationState } from './worker/conversation-do';

/**
 * Reads a receipt photo or a voice note outside the webhook update's 30 seconds. Two steps: `read`
 * (download, model call, check; retried) leaves the result in the chat's Durable Object and returns
 * only a status, and `deliver` shows it if the conversation still waits for it. Cloudflare keeps a
 * step's return value, so the receipt and the heard text never travel through the Workflow: its
 * parameters and results hold ids and a status.
 */
export class SplitAiWorkflow extends WorkflowEntrypoint<Env, SplitAiParams> {
  async run(event: Readonly<WorkflowEvent<SplitAiParams>>, step: WorkflowStep): Promise<void> {
    await runSplitAi(this.env, event.payload, step);
  }
}

/** Test hooks: the token, the readers and the fetch that reach Telegram. */
export interface AiOpts {
  token?: string | undefined;
  readers?: ReturnType<typeof splitReaders>;
  fetch?: typeof fetch;
}

/** The Workflow's steps, as a plain function so tests can run them with a fake `step`. */
export async function runSplitAi(
  env: Env,
  p: SplitAiParams,
  step: Pick<WorkflowStep, 'do'>,
  opts: AiOpts = {}
): Promise<void> {
  try {
    await step.do(
      'read',
      { retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
      () => readJob(env, p, opts)
    );
  } catch (error) {
    // The attempts ran out: the user still hears about it, with the same words as an inline failure
    await step.do('fail', () => storeResult(env, p, failureResult(p.kind, error)));
  }
  await step.do(
    'deliver',
    { retries: { limit: 1, delay: '2 seconds' }, timeout: '30 seconds' },
    () => deliverJob(env, p, opts)
  );
}

const stubOf = (env: Env, chatId: number) =>
  env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`split-${chatId}`)) as unknown as ConversationDO;

async function storeResult(env: Env, p: SplitAiParams, result: AiJobResult): Promise<string> {
  const response = await stubOf(env, p.chatId).fetch(
    new Request('http://localhost/job/store', {
      method: 'POST',
      body: JSON.stringify({ jobId: p.jobId, result }),
    })
  );
  await response.body?.cancel();
  return response.status === 204 ? 'stored' : 'stale';
}

/** The `read` step: only a status leaves it (`stale` when the conversation no longer waits). */
export async function readJob(env: Env, p: SplitAiParams, opts: AiOpts = {}): Promise<string> {
  const token = opts.token ?? env.SPLIT_BOT_TOKEN;
  if (!token) throw new Error('no SPLIT_BOT_TOKEN');
  const peek = await stubOf(env, p.chatId).fetch(new Request('http://localhost/peek'));
  const state = (await peek.json()) as ConversationState;
  if ((state.context.pendingJob as { id?: string } | undefined)?.id !== p.jobId) return 'stale';
  const { reader, voice, download } = opts.readers ?? splitReaders(env, token);
  const api = new Api(token, opts.fetch ? { fetch: opts.fetch } : undefined);
  let result: AiJobResult;
  if (p.kind === 'scan') {
    if (!reader) return storeResult(env, p, failureResult('scan', undefined));
    result = await readScan(reader, download, api, p.fileId);
  } else {
    const items = (
      (state.context.receipt as { items?: { name: string }[] } | undefined)?.items ?? []
    ).map((it) => it.name);
    if (!voice) return storeResult(env, p, failureResult('voice', undefined));
    result = await readVoice(voice, download, api, p.fileId, items);
  }
  return storeResult(env, p, result);
}

/** The `deliver` step: show the result through the handler's own code, as if the organiser's update did. */
export async function deliverJob(env: Env, p: SplitAiParams, opts: AiOpts = {}): Promise<string> {
  const token = opts.token ?? env.SPLIT_BOT_TOKEN;
  if (!token) throw new Error('no SPLIT_BOT_TOKEN');
  const api = new Api(token, opts.fetch ? { fetch: opts.fetch } : undefined);
  const update = {
    update_id: 0,
    message: {
      message_id: p.noticeMsg,
      date: Math.floor(Date.now() / 1000),
      chat: { id: p.chatId, type: p.chatType },
      from: { id: p.userId, is_bot: false, first_name: '' },
      ...(p.threadId ? { message_thread_id: p.threadId, is_topic_message: true } : {}),
    },
  } as unknown as Update;
  const me = { id: 0, is_bot: true, first_name: 'Split', username: env.SPLIT_BOT_USERNAME ?? '' };
  const ctx = new Context(update, api, me as UserFromGetMe);
  const handler = new SplitCommandHandler(
    stubOf(env, p.chatId),
    {},
    new D1UsageRepository(env.paynow_db)
  );
  await handler.deliverJob(ctx, p);
  return 'delivered';
}
