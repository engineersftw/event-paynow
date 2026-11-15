import { InlineKeyboard } from 'grammy';
import { formatCents } from '../sgqr/amount';
import type { ConversationState } from '../worker/conversation-do';
import { type Claimer, claimerName, MAX_CLAIMERS, type Receipt } from './receipt';

/**
 * The claims of a receipt split that everyone claims for themselves: what is stored, how one change is
 * applied, how the claim message looks, and how a change is written safely when several happen at
 * once. Shared by the chat handler and by anything else that edits the claims.
 */

export type Ctx = Record<string, unknown>;

/** The `split` flow's step while the claim message is open. */
export const CLAIM = 17;
/** Claiming waits an hour after the last change: people finish dinner at different speeds. */
export const CLAIM_IDLE_MS = 60 * 60 * 1000;
// Each round of simultaneous taps lets one write through, so this many taps at once all fit
export const MAX_TAP_RETRIES = 25;

/** The most ways an item can be shared. */
export const MAX_WAYS = 20;

const sgd = (cents: number) => `SGD ${formatCents(cents)}`;

export const claimsOf = (c: Ctx) => (c.claims as Record<string, number[]> | undefined) ?? {};
export const claimersOf = (c: Ctx) => (c.claimers as Claimer[] | undefined) ?? [];
export const servedOf = (c: Ctx) => (c.served as Record<string, number> | undefined) ?? {};
export const waysOf = (c: Ctx) => (c.ways as Record<string, number> | undefined) ?? {};

/** An item is locked once any of its holders has taken their QR. */
export const itemLocked = (c: Ctx, item: number) =>
  (claimsOf(c)[String(item)] ?? []).some((id) => servedOf(c)[String(id)] !== undefined);

/** The claimers (by position, which is also their place in the assignment) who hold their QR. */
export function lockedPeople(c: Ctx): Set<number> {
  const served = servedOf(c);
  return new Set(claimersOf(c).flatMap((x, i) => (served[String(x.id)] !== undefined ? [i] : [])));
}

/**
 * The claim message: every item with the people who claimed it (and the shares left). It names the
 * Mini App for the organiser only when the app link is given, i.e. when the app is configured.
 */
export function claimText(c: Ctx, appUrl?: string): string {
  const claims = claimsOf(c);
  const claimers = claimersOf(c);
  const ways = waysOf(c);
  const lines = (c.receipt as Receipt).items.map((it, i) => {
    const holders = claims[String(i)] ?? [];
    const who = holders
      .map((id) => {
        const name = claimers.find((x) => x.id === id)?.name ?? '?';
        return servedOf(c)[String(id)] !== undefined ? `${name} (QR sent)` : name;
      })
      .join(', ');
    const lock = itemLocked(c, i) ? '🔒 ' : '';
    const n = ways[String(i)];
    if (n === undefined) {
      return `${lock}${i + 1}. ${it.name} ${sgd(it.cents)}: ${who || 'unclaimed'}`;
    }
    const left = n - holders.length;
    const parts = [who, left > 0 ? `${left} left` : ''].filter(Boolean).join(', ');
    return `${lock}${i + 1}. ${it.name} ${sgd(it.cents)} (${n} ways): ${parts}`;
  });
  return `Tap the items you had; tap again to take one back. An item claimed by several people is split equally. The organiser taps Done when everyone has claimed.${appUrl ? ' The organiser can fix who had what with Edit in app.' : ''} Tap Get my QR to pay now: your items are then locked. This stays open for an hour after the last tap.\n\n${lines.join('\n')}`;
}

/**
 * The link that opens the Mini App for a chat (a direct link: Telegram allows `web_app` buttons only
 * in private chats). `startapp` carries the chat and topic; the Worker reads them from the signed
 * launch data, never from the address.
 */
export function appLink(bot: string, app: string, chatId: number, topicId: number): string {
  return `https://t.me/${bot}/${app}?startapp=${chatId}_${topicId}`;
}

/** One button per item (with how many have claimed it), Get my QR, Done and, when given, Edit in app. */
export function claimButtons(c: Ctx, appUrl?: string): InlineKeyboard {
  const claims = claimsOf(c);
  const ways = waysOf(c);
  const kb = new InlineKeyboard();
  (c.receipt as Receipt).items.forEach((it, i) => {
    const n = (claims[String(i)] ?? []).length;
    const w = ways[String(i)];
    const count = w !== undefined ? ` (${n}/${w})` : n > 0 ? ` (${n})` : '';
    const lock = itemLocked(c, i) ? '🔒 ' : '';
    kb.text(`${lock}${i + 1}. ${it.name}${count}`.slice(0, 40), `split_claim:${i}`).row();
  });
  kb.text('💳 Get my QR', 'split_claim:qr').row().text('✅ Done', 'split_claim:done');
  return appUrl ? kb.row().url('✏️ Edit in app', appUrl) : kb;
}

export type TgUser = { id: number; first_name: string; last_name?: string; username?: string };
export type ClaimOp =
  | { kind: 'toggle'; from: TgUser } // a member's own tap, or the organiser's Mine
  | { kind: 'toggleId'; id: number } // the organiser taps a person in the menu
  | { kind: 'add'; people: Claimer[] } // typed names
  | { kind: 'clear' }
  | { kind: 'ways'; n: number | null };
export type ClaimResult = { context: Ctx; note: string } | { refuse: string };

/** Apply one change to the claims of one item; pure, so it can be retried on a newer state. */
export function applyClaim(c: Ctx, item: number, op: ClaimOp): ClaimResult {
  const claims: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(claimsOf(c))) claims[k] = [...v];
  let claimers = [...claimersOf(c)];
  const ways = { ...waysOf(c) };
  const key = String(item);
  const holders = () => claims[key] ?? [];
  let note = 'Done';
  // Taking a QR fixes the amounts of everyone on the item: nobody can change it any more
  if (itemLocked(c, item))
    return { refuse: 'That item is locked: someone on it already has their QR.' };
  const served = servedOf(c);

  const add = (person: Claimer): string | undefined => {
    if (served[String(person.id)] !== undefined) {
      return 'They already have their QR, so their items cannot change.';
    }
    if (!claimers.some((x) => x.id === person.id)) {
      // A typed @username who now taps themselves becomes the same person
      const typed =
        person.id > 0 && person.username
          ? claimers.find(
              (x) => x.id < 0 && x.username?.toLowerCase() === person.username!.toLowerCase()
            )
          : undefined;
      if (typed) {
        for (const k of Object.keys(claims)) {
          claims[k] = claims[k]!.map((id) => (id === typed.id ? person.id : id));
        }
        claimers = claimers.map((x) => (x.id === typed.id ? { ...x, id: person.id } : x));
      } else {
        if (claimers.length >= MAX_CLAIMERS) return `Up to ${MAX_CLAIMERS} people can claim items.`;
        claimers.push(person);
      }
    }
    if (holders().includes(person.id)) return undefined;
    const n = ways[key];
    if (n !== undefined && holders().length >= n) return `All ${n} shares are taken.`;
    claims[key] = [...holders(), person.id];
    return undefined;
  };
  const remove = (id: number) => {
    claims[key] = holders().filter((x) => x !== id);
  };

  if (op.kind === 'toggle') {
    const known = claimers.find((x) => x.id === op.from.id);
    if (known && holders().includes(known.id)) {
      remove(known.id);
      note = 'Removed';
    } else {
      const refusal = add(
        known ?? {
          id: op.from.id,
          name: claimerName(
            claimers.map((x) => x.name),
            op.from
          ),
          ...(op.from.username ? { username: op.from.username } : {}),
        }
      );
      if (refusal) return { refuse: refusal };
      note = 'Claimed';
    }
  } else if (op.kind === 'toggleId') {
    const person = claimers.find((x) => x.id === op.id);
    if (!person) return { refuse: 'That person has no items now. Use Someone else to add them.' };
    if (holders().includes(person.id)) {
      remove(person.id);
      note = 'Removed';
    } else {
      const refusal = add(person);
      if (refusal) return { refuse: refusal };
      note = 'Added';
    }
  } else if (op.kind === 'add') {
    for (const person of op.people) {
      const refusal = add(person);
      if (refusal) return { refuse: refusal };
    }
    note = 'Added';
  } else if (op.kind === 'clear') {
    claims[key] = [];
    note = 'Cleared';
  } else if (op.n === null) {
    delete ways[key];
    note = 'Not shared';
  } else {
    if (op.n < holders().length) {
      return { refuse: `${holders().length} people already hold it, so it cannot be fewer ways.` };
    }
    ways[key] = op.n;
    note = `Shared ${op.n} ways`;
  }
  // Someone with no items left is no longer counted as a claimer
  const holding = new Set(Object.values(claims).flat());
  claimers = claimers.filter((x) => holding.has(x.id));
  return { context: { ...c, claims, claimers, ways }, note };
}

/** The part of a Durable Object stub the claim writes need. */
export type StateStore = { fetch(request: Request): Promise<Response> };

export type ClaimWrite =
  | { kind: 'ok'; context: Ctx; note: string }
  | { kind: 'refused'; text: string }
  | { kind: 'stale' }
  | { kind: 'busy' };

/**
 * Change the claims through a conditional write: read the state, apply the change to it, write
 * only if nobody wrote since, and apply it again on the newer state otherwise. That keeps
 * simultaneous changes all recorded. `check` can call a change stale (a button of an old message)
 * before it is applied; the claiming must be open (step CLAIM of the `split` flow).
 */
export async function mutateClaimsOn(
  store: StateStore,
  change: (c: Ctx, state: ConversationState) => ClaimResult,
  check?: (c: Ctx) => boolean
): Promise<ClaimWrite> {
  for (let attempt = 0; attempt < MAX_TAP_RETRIES; attempt++) {
    const state = (await (
      await store.fetch(new Request('http://localhost/state'))
    ).json()) as ConversationState;
    const c = state.context;
    if (state.flow !== 'split' || state.step !== CLAIM || (check && !check(c))) {
      return { kind: 'stale' };
    }
    const result = change(c, state);
    if ('refuse' in result) return { kind: 'refused', text: result.refuse };
    const response = await store.fetch(
      new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify({
          flow: 'split',
          step: CLAIM,
          context: result.context,
          idleMs: CLAIM_IDLE_MS,
          ifRev: state.rev ?? 0,
        }),
      })
    );
    await response.body?.cancel();
    if (response.status === 409) continue; // another change got in first: apply this one on top of it
    return { kind: 'ok', context: result.context, note: result.note };
  }
  return { kind: 'busy' };
}
