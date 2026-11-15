## Why

Confirm in the Split bot renders and posts every QR inside one background update, which Cloudflare stops 30 seconds after the update arrived. A real split lost three of its four QRs this way. PR #96 shrank each upload (PNG) and added a 20-second cut-off that names the QRs not sent, but a split with many amounts, a slow Telegram, or a Telegram "slow down" (429) can still leave people without a QR and the organiser redoing the split.

## What Changes

- Confirm puts one message per QR on a Cloudflare Queue and returns at once. A queue consumer in the same Worker renders and posts each QR in its own run, so the number of QRs no longer matters.
- Get my QR (early QR in group claiming) is queued the same way; the member's amount is fixed at the tap as today.
- Failed sends are retried: after a Telegram 429 the consumer waits the `retry_after` Telegram gives; after other temporary errors it backs off; at most 5 attempts. A permanent refusal or the last failed attempt posts one message in the chat naming the amount and people whose QR was not sent.
- QRs may arrive in any order (each names who it is for).
- When the queue binding is missing (local dev, most tests) or queueing fails, the bot falls back to today's direct sending with the 20-second cut-off.
- `wrangler.toml` gains a producer and consumer for a new queue `split-qr-sends`; the queue must be created once before the first deploy.

Out of scope: the Event and Simple bots (one QR per message); a dead-letter queue; ordering guarantees; changing what a QR looks like.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: QRs are posted in the background, one at a time, with retries and a failure notice; the early QR is posted shortly after the tap; the data kept now includes a QR waiting in the send queue.

## Impact

- New `src/split-qr-queue.ts`: message type, producer helper and the `queue()` consumer.
- `src/worker.ts` (default export gains `queue`), `src/env.ts` (`SPLIT_QR_QUEUE?: Queue`), `wrangler.toml` (queue producer and consumer).
- `src/commands/split-handler.ts`: `finish` and `deliverEarly` enqueue when the queue exists, else send directly as now.
- Tests: queue producer and consumer tests (`cloudflare:test` queue helpers); existing split tests keep the direct path by building the bot without the queue binding.
- Deploy: `wrangler queues create split-qr-sends` once (by hand or as a step in `deploy.yml`). Cloudflare Queues are included in the Workers Paid plan (1 million operations a month; each QR is about three).
- Privacy: a queued message holds the QR data (payee, amount, description, names) until it is posted or given up; it is never logged.
