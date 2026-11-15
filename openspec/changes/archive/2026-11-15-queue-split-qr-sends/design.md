## Context

The Split bot answers Telegram at once and runs each update under `ctx.waitUntil` (`acceptUpdate`), which Cloudflare stops 30 seconds after the request. `finish` in `src/commands/split-handler.ts` builds `jobs` (one per distinct amount: `cents` and `lines`), then for each renders a QR (`qrPhoto`: BMP → PNG, about 20 KB, about 20 ms CPU) and calls `ctx.replyWithPhoto`; since #96 it stops starting sends after 20 seconds and names the rest. `deliverEarly` posts one QR per Get my QR tap. The Worker has no queue today. The account is on Workers Paid. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- No QR is lost because of the background time limit, however many amounts a split has.
- A Telegram 429 or a passing error delays a QR instead of dropping it.
- The chat is told about any QR that is finally not sent.

**Non-Goals:**
- Order of QRs in the chat; the Event and Simple bots; a dead-letter queue; storing QRs anywhere but the queue.

## Decisions

**Cloudflare Queues, one message per QR.** Confirm calls `SPLIT_QR_QUEUE.sendBatch(jobs)`; the consumer handles each message in its own run with its own limits, and Queues retry per message with a delay. Alternatives: a Durable Object alarm chain (state and retry logic hand-written), or the Worker calling itself once per QR (no retries, more requests in flight). Rejected: Queues give retry, delay and per-message isolation for a few lines of config.

**The message carries everything needed, nothing else.** `{ v: 1, chatId, threadId?, payload, lines, caption }`: the SGQR payload string (it already contains the payee, amount and description), the image text lines, and the caption. No token or context: the consumer uses `env.SPLIT_BOT_TOKEN` and grammY's `Api` (`new Api(token).sendPhoto(chatId, InputFile, { caption, message_thread_id })`). A message is a few hundred bytes (limit 128 KB). It is never logged; failures log only the error code and description.

**Render in the consumer.** Rendering a QR costs about 20 ms of CPU; doing it in the consumer keeps Confirm short and lets each QR fail or retry on its own.

**Retry policy in the consumer, not just `max_retries`.** For each message: on success, ack and count `SPLIT_QR_CHAT`. On a `GrammyError` with `error_code` 429, `msg.retry({ delaySeconds: parameters.retry_after })`. On a permanent error (400 chat not found, 403 forbidden), ack and stop. On anything else, retry with `delaySeconds = 2 ** attempts` (2, 4, 8, 16). When `msg.attempts >= 5`, ack and post the failure notice: "Could not send the QR for SGD 30.00 (Bob). Please send /split to try again." The notice is best-effort (it may fail for the same reason). `max_retries = 5` in config as a backstop.

**Producer with a fallback.** `finish` and `deliverEarly` use the queue when `env.SPLIT_QR_QUEUE` exists; when it is missing, or `sendBatch` throws, they fall back to the current direct path (with the 20-second cut-off), so local dev and existing tests keep working and a Queues outage does not stop QRs. The handler gets the queue through its constructor, like `receipts`.

**Early QR.** `qrTap` fixes `served` and then enqueues one message; the tap is answered "Your QR will be posted in the chat in a moment." The rollback of `served` only happens when neither enqueueing nor the direct send works. A QR that the consumer finally gives up on is reported by the notice, naming the member; their amount stays fixed (the organiser can still collect it by hand). This is the one behaviour that differs from today and is accepted.

**Config.** `wrangler.toml`: `[[queues.producers]] queue = "split-qr-sends", binding = "SPLIT_QR_QUEUE"` and `[[queues.consumers]] queue = "split-qr-sends", max_batch_size = 10, max_batch_timeout = 1, max_retries = 5`. The consumer is the same Worker (`export default { fetch, queue }` in `src/worker.ts`). The queue is created once with `wrangler queues create split-qr-sends`; `deploy.yml` gets an idempotent step (`create` ignoring "already exists") before `wrangler deploy`, so a fresh account or a new environment does not fail.

**Tests.** Existing split tests build the bot with `SPLIT_QR_QUEUE: undefined` so they stay on the direct path. New Workers tests: Confirm enqueues one message per amount (spy on the binding); the consumer posts a QR (stub Telegram), retries with `retry_after` on 429, retries with backoff on a 500, acks and posts the notice after the last attempt, acks without retry on 403, counts `SPLIT_QR_CHAT`; Get my QR enqueues one message; the fallback runs when `sendBatch` throws.

## Risks / Trade-offs

- **Order.** QRs can arrive out of order; accepted (each names its people).
- **Privacy.** The payee number sits in the queue message until it is sent or given up (minutes at most with 5 attempts). Never logged; noted in the spec.
- **Group flood limit.** Parallel consumers can hit Telegram's per-group limit sooner; the 429 path handles it by waiting.
- **Deploy dependency.** The first deploy fails without the queue; mitigated by the `deploy.yml` step.
- **Cost.** About three Queue operations per QR, inside the 1 million a month included in Workers Paid.
- **Early QR given up.** The member's amount is fixed but they have no QR; the notice says so. Rare (5 failed attempts).
