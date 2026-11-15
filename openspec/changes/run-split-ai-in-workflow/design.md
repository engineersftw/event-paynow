## Context

`handlePhoto` and `handleVoice` (`src/commands/split-handler.ts`) download the file, call a `ReceiptReader` / `VoiceReader` (Workers AI) and show the result, all inside the update that `acceptUpdate` runs under `waitUntil`. Cloudflare ends that work 30 seconds after the update arrived and gives no signal. The readers have no timeout and no retry. The QR sends already moved to a Queue for the same reason; a scan or a voice note is one job, not many, so a Workflow (durable steps with timeouts and retries) fits better than a Queue.

Constraint to keep: photos, audio, scan results and heard text are never stored or logged (spec: "Receipt photos are not kept", "Voice notes are limited and never kept"). Cloudflare keeps Workflow instance parameters, step outputs and step error messages for its retention period, so none of those may carry bill data.

## Goals / Non-Goals

**Goals:**
- No scan or voice note is lost to the 30-second cut-off.
- A transient AI or download failure is retried before the user hears about it.
- A result never lands in a conversation that moved on.
- The privacy promise holds: nothing about the bill sits in Workflow state.

**Non-Goals:**
- Other models or prompts, a new review layout, a dead-letter store, Event/Simple bots.

## Decisions

**1. One Workflow class, two job kinds.** `SplitAiWorkflow` takes `{ kind: 'scan' | 'voice', jobId, chatId, threadId?, userId, fileId, noticeMsg, … }` (ids only). `run` does two steps:
- `step.do('read', { retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '2 minutes' }, …)`: download by `file_id` (a Bot API token from `env`), call the reader, validate with `parseScan` / `parseAssignments`, write the validated result to the chat's Durable Object under `jobId`, return `{ status }` only. A voice job gets the item names from the Durable Object (`/peek`), not from the parameters. A model or download failure throws (retried); an unusable answer (no total, no lines, nothing heard) is not an error: the step stores a `{ failed: reason }` result and returns normally, so it is not retried.
- `step.do('deliver', { retries: { limit: 1 }, timeout: '30 seconds' }, …)`: takes the stored result from the Durable Object, checks the job is still current, and shows it. If `read` ran out of retries, `run` catches that and calls `deliver` with a `{ failed: 'reader' }` result, so the user always hears something.
*Why two steps and the Durable Object in the middle:* a step's return value is persisted by Cloudflare. Returning the receipt or the heard text would break the privacy promise; the Durable Object already holds exactly this data for the life of the conversation, with its 10-minute expiry. *Alternative:* one step that does everything. Simpler, but a retry after a partly sent reply could post two reviews, and a deliver failure would redo the paid AI call.

**2. Stale results are dropped by job id.** `handlePhoto` / `handleVoice` write `pendingJob: { id, kind, step }` into the conversation context before starting the instance. The delivery asks the Durable Object (`POST /job/take { jobId }`, an atomic compare-and-take in the same style as `/claim`): it returns the result only if `pendingJob.id` still equals the id, the flow is `split` and the step is the same one. A newer photo or voice note overwrites `pendingJob`, so the older result finds no match. A cancel or expiry clears the context, with the same outcome. A dropped job deletes its notice message and says nothing.

**3. Delivery reuses the handler code through a synthetic `Context`.** The review (`showReview`), the voice reply (heard text, lines, **Use these lines**) and the failure messages need a grammY `Context`. The workflow builds one with `new Context(update, api, botInfo)` from a minimal synthetic message update (chat, from, thread) and calls the same private methods, which are split out of `handlePhoto` / `handleVoice` as `deliverScan(ctx, state, result)` and `deliverVoice(ctx, state, result)`. The inline fallback path calls the same two methods, so both paths show identical messages. *Alternative:* a `Reply` port interface for the handler. Cleaner, but it touches every `ctx.reply` in `showReview`; revisit only if the synthetic `Context` turns out brittle.

**4. Inline fallback.** `SplitBotDeps.aiWorkflow?: Workflow<SplitAiParams>` is passed only by the webhook route (like `qrQueue`). Without it, or when `create()` throws, the handler runs the current inline code. Most tests keep the inline path.

**5. Starting is cheap and safe.** The handler stores `pendingJob` first, then `create({ id: jobId, params })`. If `create` throws, it clears `pendingJob` and reads inline. The job id is built from the Telegram `update_id` (`split-<update_id>`) and used as the instance id. Telegram may deliver the same update twice; the second `create` with the same id fails, and the handler treats that as "already started" and does nothing more.

**6. Counts and logs.** The deliver step counts `SPLIT_SCAN_OK` / `SPLIT_SCAN_FAILED` once. Errors are logged as today (stage and the error's own message, cut to 200 characters), and a step error message must never contain a response body or the heard text, since Workflows keep step errors: the readers already throw only `error.message` of the AI call, and the download error names no URL (the file URL holds the bot token, so the step catches and rethrows a fixed `download failed`).

## Risks / Trade-offs

- **Bot token in a Workflow:** the workflow reads `SPLIT_BOT_TOKEN` from `env` (a secret, not a param) and never puts it in a message or error. The download error is replaced with a fixed text for that reason.
- **Retention:** instance params (ids and the job id) are kept by Cloudflare for its retention period. Mitigation: ids only; stated in the specs and on the Split landing page.
- **Latency:** starting an instance adds a short delay compared with the inline call. Mitigation: the "Reading…" / "Listening…" notice is posted before the instance starts, as today.
- **Synthetic `Context` drift:** a future handler change that reads another `ctx` field could break the background path. Mitigation: a test runs `deliverScan` / `deliverVoice` through the step functions with the same fake Telegram the handler tests use.
- **Testing the Workflow runtime:** Workflow introspection in the Workers pool may not exist in the pinned `@cloudflare/vitest-pool-workers`. Mitigation: all logic lives in plain functions the tests call directly; the class is thin and checked once in the live run (task 4.3).
- **Deploy permission:** the token needs Workflows: Edit; the first deploy fails with `Authentication error [code: 10000]` without it, as happened with Queues.

## Migration Plan

1. Merge. The deploy publishes the class and the `[[workflows]]` binding; no D1 migration.
2. Add Workflows: Edit to the Cloudflare API token before merging (otherwise the Worker deploy fails and the previous version keeps running).
3. Rollback: remove the `aiWorkflow` dep from `getSplitBot`; the inline path is unchanged and the Workflow class can stay unused.

## Open Questions

- The exact Cloudflare retention for finished Workflow instances (to quote on the landing page); to be checked in the dashboard during task 4.3.
- Whether the pinned vitest pool can introspect a Workflow; if so, add one end-to-end test.
