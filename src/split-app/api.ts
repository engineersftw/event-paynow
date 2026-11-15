import { Api } from 'grammy';
import { type Receipt, resolveTyped } from '../commands/receipt';
import {
  appLink,
  applyClaim,
  CLAIM,
  type ClaimOp,
  type Ctx,
  claimButtons,
  claimersOf,
  claimsOf,
  claimText,
  itemLocked,
  MAX_WAYS,
  mutateClaimsOn,
  servedOf,
  waysOf,
} from '../commands/split-claims';
import type { Env } from '../env';
import type { ConversationState } from '../worker/conversation-do';
import { type InitDataUser, verifyInitData } from './init-data';
import { renderSplitAppPage, splitAppPageHeaders } from './page';

/**
 * The Mini App's JSON interface for the organiser of a group's claim split. Every call carries
 * Telegram's signed launch data (`Authorization: tma <initData>`); the chat comes from the signed
 * `start_param`, and only the organiser of that chat's open claiming is served. The claims live in
 * the chat's Durable Object, as they do for the chat buttons; nothing is stored or logged here.
 */

export const SPLIT_APP_API = '/split-app/api';
const MAX_TEXT = 500; // typed names for one change; far above what 20 short names need

/** What a test can replace: the Bot API client used to refresh the claim message. */
export interface SplitAppDeps {
  fetch?: typeof fetch;
}

/** On when the Mini App is named and the Split bot has its token. */
export const splitAppConfigured = (env: Env): boolean =>
  Boolean(env.SPLIT_APP_NAME && env.SPLIT_BOT_TOKEN);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const displayName = (u: InitDataUser) =>
  [u.first_name, u.last_name].filter(Boolean).join(' ') || u.first_name;

type Session = {
  user: InitDataUser;
  chatId: number;
  topicId: number;
  store: DurableObjectStub;
  state: ConversationState;
};

/** Who is calling, for which chat, and whether they may edit its open claiming. */
async function authorise(request: Request, env: Env): Promise<Session | Response> {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('tma ')) return json({ error: 'unauthorized' }, 401);
  const launch = await verifyInitData(header.slice(4), env.SPLIT_BOT_TOKEN!);
  if (!launch) return json({ error: 'unauthorized' }, 401);

  const target = /^(-?\d{1,20})_(\d{1,10})$/.exec(launch.startParam ?? '');
  if (!target) return json({ error: 'no_chat' }, 400);
  const chatId = Number(target[1]);
  const topicId = Number(target[2]);

  const store = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`split-${chatId}`));
  // Read-only: a call for a chat with no conversation creates nothing and extends no expiry
  const state = (await (
    await store.fetch(new Request('http://localhost/peek'))
  ).json()) as ConversationState;
  if (state.flow !== 'split' || state.step !== CLAIM) return json({ error: 'over' }, 409);
  if (state.owner?.userId !== launch.user.id || state.owner.topicId !== topicId) {
    return json({ error: 'not_organiser' }, 403);
  }
  return { user: launch.user, chatId, topicId, store, state };
}

/** Items with their holders, and the people who hold something (the organiser is always one). */
function view(c: Ctx, organiser: InitDataUser) {
  const claims = claimsOf(c);
  const ways = waysOf(c);
  const served = servedOf(c);
  const items = (c.receipt as Receipt).items.map((it, i) => ({
    name: it.name,
    cents: it.cents,
    holders: claims[String(i)] ?? [],
    ...(ways[String(i)] !== undefined ? { ways: ways[String(i)] } : {}),
    locked: itemLocked(c, i),
  }));
  const people = claimersOf(c).map((p) => ({
    id: p.id,
    name: p.name,
    served: served[String(p.id)] !== undefined,
  }));
  if (!people.some((p) => p.id === organiser.id)) {
    people.unshift({ id: organiser.id, name: displayName(organiser), served: false });
  }
  return { items, people, organiserId: organiser.id };
}

type ClaimBody = {
  item?: unknown;
  op?: unknown;
  id?: unknown;
  text?: unknown;
  n?: unknown;
};

/** The change a request asks for, or the reason it cannot be made. */
function operation(
  body: ClaimBody,
  c: Ctx,
  user: InitDataUser
): { item: number; op: ClaimOp } | { error: string } {
  const items = (c.receipt as Receipt).items;
  const item = body.item;
  if (typeof item !== 'number' || !Number.isInteger(item) || !items[item]) {
    return { error: 'There is no such item.' };
  }
  switch (body.op) {
    case 'mine':
      return { item, op: { kind: 'toggle', from: user } };
    case 'toggle':
      return typeof body.id === 'number' && Number.isInteger(body.id)
        ? { item, op: { kind: 'toggleId', id: body.id } }
        : { error: 'Pick a person.' };
    case 'add': {
      if (typeof body.text !== 'string' || body.text.length > MAX_TEXT) {
        return { error: 'Send at least one name.' };
      }
      const typed = resolveTyped(claimersOf(c), body.text, undefined, {
        id: user.id,
        name: displayName(user),
      });
      return typed.ok
        ? { item, op: { kind: 'add', people: typed.people } }
        : { error: typed.error };
    }
    case 'everyone': {
      // Everyone listed who is not on the item yet and can still change; all or nobody
      const held = new Set(claimsOf(c)[String(item)] ?? []);
      const served = servedOf(c);
      const listed = [...claimersOf(c)];
      if (!listed.some((p) => p.id === user.id)) {
        listed.push({ id: user.id, name: displayName(user) });
      }
      const people = listed.filter((p) => !held.has(p.id) && served[String(p.id)] === undefined);
      if (people.length === 0) return { error: 'Everyone is already on this item.' };
      const n = waysOf(c)[String(item)];
      if (n !== undefined && people.length > n - held.size) {
        const left = Math.max(0, n - held.size);
        return { error: `Only ${left} share${left === 1 ? '' : 's'} left, so not everyone fits.` };
      }
      return { item, op: { kind: 'add', people } };
    }
    case 'clear':
      return { item, op: { kind: 'clear' } };
    case 'ways': {
      if (body.n === null) return { item, op: { kind: 'ways', n: null } };
      const n = body.n;
      return typeof n === 'number' && Number.isInteger(n) && n >= 2 && n <= MAX_WAYS
        ? { item, op: { kind: 'ways', n } }
        : { error: `Send a whole number from 2 to ${MAX_WAYS}.` };
    }
    default:
      return { error: 'Unknown change.' };
  }
}

/** Show the new claims in the chat; a message that did not change or cannot be edited is not an error. */
async function refreshClaimMessage(
  env: Env,
  s: Session,
  c: Ctx,
  deps: SplitAppDeps
): Promise<void> {
  if (c.claimMsg === undefined) return;
  const api = new Api(env.SPLIT_BOT_TOKEN!, deps.fetch ? { fetch: deps.fetch } : undefined);
  const link =
    env.SPLIT_BOT_USERNAME && env.SPLIT_APP_NAME
      ? appLink(env.SPLIT_BOT_USERNAME, env.SPLIT_APP_NAME, s.chatId, s.topicId)
      : undefined;
  await api
    .editMessageText(s.chatId, c.claimMsg as number, claimText(c, link), {
      reply_markup: claimButtons(c, link),
    })
    .catch(() => undefined);
}

/** `GET /split-app`: the Mini App page. Nothing in it depends on the chat; every call it makes is signed. */
export function handleSplitAppPage(env: Env): Response {
  if (!splitAppConfigured(env)) return new Response('Not found', { status: 404 });
  const nonce = btoa(crypto.randomUUID());
  return new Response(renderSplitAppPage(nonce), { headers: splitAppPageHeaders(nonce) });
}

/** `GET /split-app/api/state` and `POST /split-app/api/claim`; 404 for anything else or when off. */
export async function handleSplitAppApi(
  request: Request,
  env: Env,
  deps: SplitAppDeps = {}
): Promise<Response> {
  if (!splitAppConfigured(env)) return new Response('Not found', { status: 404 });
  const path = new URL(request.url).pathname;

  if (request.method === 'GET' && path === `${SPLIT_APP_API}/state`) {
    const s = await authorise(request, env);
    if (s instanceof Response) return s;
    return json(view(s.state.context, s.user));
  }

  if (request.method === 'POST' && path === `${SPLIT_APP_API}/claim`) {
    const s = await authorise(request, env);
    if (s instanceof Response) return s;
    const body = (await request.json().catch(() => null)) as ClaimBody | null;
    if (!body) return json({ error: 'Send a change.' }, 400);

    let refusal: string | undefined;
    const result = await mutateClaimsOn(s.store, (c) => {
      const wanted = operation(body, c, s.user);
      if ('error' in wanted) {
        refusal = wanted.error;
        return { refuse: wanted.error };
      }
      return applyClaim(c, wanted.item, wanted.op);
    });
    if (result.kind === 'stale') return json({ error: 'over' }, 409);
    if (result.kind === 'busy') return json({ error: 'busy' }, 503);
    if (result.kind === 'refused') return json({ error: result.text || refusal }, 422);

    await refreshClaimMessage(env, s, result.context, deps);
    return json({ ok: true, note: result.note, ...view(result.context, s.user) });
  }

  return new Response('Not found', { status: 404 });
}
