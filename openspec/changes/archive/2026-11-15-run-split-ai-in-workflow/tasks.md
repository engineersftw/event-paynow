## 1. Workflow and Durable Object

- [x] 1.1 Add `[[workflows]]` (`name = "split-ai"`, `binding = "SPLIT_AI_WORKFLOW"`, `class_name = "SplitAiWorkflow"`) to `wrangler.toml`, `SPLIT_AI_WORKFLOW?: Workflow<SplitAiParams>` to `src/env.ts`, and export the class from `src/index.ts`
- [x] 1.2 In `src/worker/conversation-do.ts` add `pendingJob` handling: `POST /job/store { jobId, result }` and an atomic `POST /job/take { jobId }` that returns the stored result only when the conversation's `pendingJob.id` equals `jobId`, the flow is `split` and the step is the one the job was started at, and clears it either way; covered by the existing alarm expiry
- [x] 1.3 Add `src/split-ai-workflow.ts`: `SplitAiParams` (ids only), plain functions `readScanJob` / `readVoiceJob` (download by `file_id` with a fixed `download failed` error, call the reader, validate with `parseScan` / `parseAssignments`, store the result in the Durable Object, return a status only) and `deliverJob`, and the `SplitAiWorkflow` class with the `read` step (timeout 2 min, 2 retries, exponential backoff) and the `deliver` step; when `read` runs out of retries, deliver a failure result

## 2. Handler

- [x] 2.1 Split `handlePhoto` and `handleVoice` into starting, reading and delivering: `deliverScan(ctx, state, result)` and `deliverVoice(ctx, state, result)` hold today's messages, buttons, counters and the notice removal, and both the inline path and the workflow call them
- [x] 2.2 Build the `Context` for delivery from a synthetic message update (chat, thread, from) with grammY's `Context` class; pass `aiWorkflow` through `SplitBotDeps` from `getSplitBot`
- [x] 2.3 In `handlePhoto` / `handleVoice`: after the notice and the `pendingJob` write, `create` an instance with id `split-<update_id>`; treat an "already exists" error as started; on any other error clear `pendingJob` and read inline

## 3. Tests

- [x] 3.1 Keep the existing split tests on the inline path (no `aiWorkflow` dep) and check the suite still passes
- [x] 3.2 Step function tests: scan ok, unusable scan (stored as a failure, not retried), model error (throws), download error (fixed message, no URL or token in it), voice with nothing heard, voice with lines; the stored result and the returned status never contain receipt or heard text
- [x] 3.3 Delivery tests: result shown when the job is current; dropped and the notice removed after Cancel, a newer photo, a different step and expiry; a retries-exhausted job shows the usual failure message and counts once
- [x] 3.4 Handler tests with a fake Workflow binding: a photo and a voice note start one instance with ids-only params; a throwing `create` falls back to the inline read; a repeated `update_id` starts only one instance

## 4. Docs and rollout

- [x] 4.1 Update README (background reading, the Workflows permission for the API token), AGENTS.md, `docs/architecture.md`, the Split landing page wording and its test (nothing about the bill in the Workflow; what the instance holds), and the stores-nothing text
- [x] 4.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
- [x] 4.3 Add Workflows: Edit to the Cloudflare API token, deploy, then watch `wrangler tail` and the Workflows page during one receipt scan and one voice note: both arrive, instance params hold ids only, and note the retention shown for finished instances
