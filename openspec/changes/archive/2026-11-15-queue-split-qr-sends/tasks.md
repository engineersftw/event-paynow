## 1. Queue and consumer

- [x] 1.1 Add the producer and consumer for queue `split-qr-sends` to `wrangler.toml`, `SPLIT_QR_QUEUE?: Queue<SplitQrMessage>` to `src/env.ts`, and an idempotent `wrangler queues create split-qr-sends` step before the Worker deploy in `.github/workflows/deploy.yml`
- [x] 1.2 Add `src/split-qr-queue.ts`: the `SplitQrMessage` type, `queueSplitQrs(queue, messages)` (`sendBatch`), and `handleSplitQrBatch(batch, env)`: render with `qrPhoto`, post with grammY `Api` and `SPLIT_BOT_TOKEN`, ack and count `SPLIT_QR_CHAT` on success, retry with `retry_after` on 429, ack without retry on 400/403, retry with `2 ** attempts` seconds otherwise, and after the 5th attempt ack and post the failure notice (best-effort); log only the error code and description
- [x] 1.3 Export `queue` beside `fetch` in `src/worker.ts`, routing batches of `split-qr-sends` to `handleSplitQrBatch`
- [x] 1.4 Move `qrPhoto` to a place both the handler and the consumer import (for example `src/sgqr/png.ts` or a small shared module)

## 2. Producer in the Split handler

- [x] 2.1 Pass the queue to `SplitCommandHandler` from `src/split-bot.ts`
- [x] 2.2 In `finish`, build one message per job (chat id, topic id, payload, lines, caption) and enqueue them; on a missing queue or a failed `sendBatch`, use the existing direct loop with the 20-second cut-off
- [x] 2.3 In `deliverEarly`, enqueue one message and answer "Your QR will be posted in the chat in a moment."; fall back to the direct send when queueing fails; keep the `served` rollback only for when both fail

## 3. Tests

- [x] 3.1 Keep the existing split tests on the direct path (build their bots with `SPLIT_QR_QUEUE: undefined`) and check the suite still passes
- [x] 3.2 Producer tests: Confirm enqueues one message per distinct amount with the right chat, topic, lines and caption, and sends no photo itself; Get my QR enqueues one; a throwing `sendBatch` falls back to direct sends
- [x] 3.3 Consumer tests (`cloudflare:test` message batches and a stubbed Telegram): posts and counts; 429 retries with `retry_after`; 500 retries with backoff; 403 acks without retry; the 5th failed attempt acks and posts the notice naming the amount and people; nothing in the logs contains the payee number

## 4. Docs and rollout

- [x] 4.1 Update README (Split bot delivery, the queue to create, cost), AGENTS.md and docs/architecture.md
- [x] 4.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
- [x] 4.3 Create the queue on the account (`wrangler queues create split-qr-sends`) or confirm the deploy step did, deploy, and run one group split with at least five distinct amounts while watching `wrangler tail`: every QR arrives, no 30-second cut-off, and a forced failure (for example a removed bot in a test group) produces the notice (Done: the queue was created by hand, the deploy token got Queues: Edit, the Worker is the queue producer and consumer, and the live split posted every QR.)
