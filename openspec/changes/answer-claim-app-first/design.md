## Context

See proposal.md - Why. In `src/split-app/api.ts` a claim change runs: authorise (a read-only `/peek` of the chat's Durable Object), `mutateClaimsOn` (a read, the change, a conditional write with `ifRev`, retried on a conflict), then `await refreshClaimMessage(...)`, which edits the claim message in the chat through a plain grammY `Api`, and only then the JSON answer. The edit is one call to Telegram's Bot API; it changes nothing the app shows, because the page uses the answer's own view of the claims. Chat taps keep their own refresh in the handler and are not touched here.

The Worker's `fetch` receives an `ExecutionContext`; `ctx.waitUntil(promise)` lets work finish after the response has been sent. The interface functions do not take it today, and the tests call them directly with a fake Telegram `fetch`.

## Goals / Non-Goals

**Goals:**
- The page gets its answer without waiting for Telegram.
- The chat message still ends up showing the newest claims, in any order the updates finish.
- A waiting update never reopens a closed message.

**Non-Goals:**
- Fewer or faster Durable Object calls, optimistic updates, and changes to the chat taps' refresh (see proposal).

## Decisions

**Optional `waitUntil` in the interface's dependencies.** `SplitAppDeps` gains `waitUntil?: (p: Promise<unknown>) => void`. With it, the claim route starts the refresh, hands the promise over and answers at once; without it, it awaits the refresh as today. `src/worker.ts` passes `(p) => ctx.waitUntil(p)` for the Mini App routes. Alternatives: a Queue message for the edit (a Queue per tap is heavier than one `waitUntil`, and the Split bot already has one for QRs but its retries would repeat stale edits); a Durable Object alarm (more moving parts for a one-shot edit).

**The refresh renders from the conversation as it is when it runs, not from the change that started it.** It reads `/peek`, builds the text and buttons from that state, edits, reads `/peek` again, and repeats while the revision (`rev`, which every content write bumps) differs from the one it rendered, at most 3 rounds. So: two quick changes each start a refresh, and whichever finishes last has read the latest claims; an earlier edit that finishes late finds the revision moved on and edits again with the newest claims; a chat tap in between is covered the same way. Alternative: edit from the changed context directly: simplest, but a slow earlier edit arriving after a fast later one would leave the chat showing older claims, which the background version makes possible (today the page waits, which hides but does not remove the same order problem).

**Skip when the claiming is not open.** The refresh's read checks the flow is `split` at step CLAIM and that the claim message id is known; otherwise it returns without editing. That is the guarantee the spec states: no edit starts once the claiming is closed. It cannot undo an edit that is already on its way when Done is tapped (a window of a few milliseconds that exists today as well).

**Errors stay ignored.** As now, a failed or refused edit (for example "message is not modified", or Telegram refusing for a moment) is swallowed; the stored claims win and the next change edits again. A failed edit does not fail the answer, which has already gone.

## Risks / Trade-offs

- The chat message lags the app by the length of the edit → that is the point of the change; the claim message is for members, who see it update a moment later.
- Several quick changes start several refreshes at once, each making up to a few Telegram calls → the cap of 3 rounds bounds each; Telegram's own limits already apply to quick taps today.
- `waitUntil` work is cut off if the isolate is torn down before it finishes → rare, and the next change or tap edits the message again with the then-newest claims.
- A refresh that finds nothing to do still costs two reads of the conversation → cheap compared with a Telegram call, and only while the claiming is open.

## Migration Plan

Deploy the Worker; no migration, no configuration. Rollback: revert the commit (the interface awaits the edit again).
