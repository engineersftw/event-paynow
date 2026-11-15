## Why

The Split bot reads a receipt photo and a voice note inside the one background update Cloudflare gives a webhook, and stops that work 30 seconds after the update arrived, without a word. A scan is one vision call (about 8 s in tests); a voice note is a speech call and then a text call. Both normally fit, but a slow model or a busy moment pushes them over: the user then sees "Reading your receipt…" or "Listening…" forever and has to guess that they should resend. The two readers have no timeout and no retry, so a single transient model error is also final.

A Cloudflare Workflow runs the same work outside that window. Each step has its own timeout and retries with backoff, and a step that already finished is not repeated.

## What Changes

- A receipt photo or a voice note starts a Workflow instance (`SplitAiWorkflow`) and the update returns at once. The instance holds only ids (chat, topic, user, message ids, Telegram `file_id`, a job id). A voice job reads the numbered item names from the chat's Durable Object, not from the parameters.
- Step 1 downloads the file from Telegram, calls Workers AI and validates the answer (`parseScan`, or `parseAssignments` for voice), with a timeout and 2 retries with backoff on a model error. Its result is written to the chat's Durable Object under the job id; the step returns only a status, so the receipt, the audio and the heard text never sit in Workflow state.
- Step 2 delivers: it asks the Durable Object whether the job is still the one the conversation waits for, and if so shows the review (scan) or the heard text and the **Use these lines** button (voice) exactly as today. A job whose conversation moved on or expired is dropped and its notice message removed.
- When the retries run out, or the result is unusable, the user gets the same failure messages and buttons as today (Send another photo, Type the total instead, or "Voice is not working right now").
- When the Workflow binding is missing (local dev, most tests) or starting an instance fails, the bot reads inline as it does today.
- `wrangler.toml` gains a `[[workflows]]` binding; the deploy token needs the Workflows permission.

Out of scope: the Event and Simple bots (they use no AI); changing the models or prompts; changing what the review or the voice reply looks like; a dead-letter store for failed jobs.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: receipt scans and voice notes are read in the background with a timeout and retries; a result only applies to the conversation that asked for it; the data kept now includes the ids a Workflow instance holds.

## Impact

- New `src/split-ai-workflow.ts`: `SplitAiWorkflow` (`WorkflowEntrypoint`), the job params type and the plain functions its steps call (`readScanJob`, `readVoiceJob`, `deliverJob`), so tests run them without the Workflows runtime.
- `src/index.ts` (export the class), `src/env.ts` (`SPLIT_AI_WORKFLOW?: Workflow<SplitAiParams>`), `wrangler.toml` (`[[workflows]]`).
- `src/worker/conversation-do.ts`: store, read and clear one pending job result by job id, covered by the existing 10-minute expiry.
- `src/commands/split-handler.ts`: `handlePhoto` and `handleVoice` start a job when the binding exists, keep the current inline path otherwise; the delivery code is shared by both paths.
- Tests: step functions and the delivery check (stale job, expired conversation, wrong step); handler tests with a fake Workflow binding; existing split tests keep the inline path.
- Deploy: the `CLOUDFLARE_API_TOKEN` needs Workflows: Edit (like Queues before); Workflows are included in the Workers Paid plan.
- Privacy: Workflow instances and their params are kept by Cloudflare for its retention period. They carry ids only; the photo, the audio, the scan result and the heard text are never in params or step results. The landing page and specs say so.
