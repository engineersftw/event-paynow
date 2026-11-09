## 1. Split maths

- [x] 1.1 Add `src/commands/split-math.ts` with `splitEqually(totalCents, people)` (integer, rounded up, returns share, collected, over) and a `MAX_PEOPLE = 100` check helper
- [x] 1.2 Add `test/node/split-math.test.ts`: even division, remainder (100.00 by 3 → 33.34, over 0.02), 187.40 by 4 → 46.85, people larger than cents rejected, bounds 2 and 100

## 2. Conversation

- [x] 2.1 Add `'split'` to the `flow` enum in `src/worker/conversation-do.ts` (covered by the workers test, which reads the `split` flow back from the Durable Object)
- [x] 2.2 Add `src/commands/split-handler.ts`: steps total → people → payee → description (Skip) → confirm; validation messages; group member-count button via `getChatMemberCount` minus the bot; masked payee in group summaries; force-reply prompts in groups; best-effort `deleteMessage` of the payee message
- [x] 2.3 Confirm via DO `POST /claim` (one QR on a double tap); fixed, non-editable QR for the share with description; image lines and caption without the payee number; "could not make the QR" path with no logging
- [x] 2.4 Cover the handler in `test/workers/split-bot.test.ts` (real pipeline, no separate mocked test): full flow, skip, each validation error, member-count button used and bypassed, count unavailable or below 2, masked summary in a group, cancel, double confirm

## 3. Bot, route and configuration

- [x] 3.1 Add `src/split-bot.ts` (`createSplitBot`, cached `handleSplitWebhook`), commands `split`, `start`, `help`, `cancel`; owner stamp after `/split`; owner-only text and callbacks in groups with the "not your split" notice
- [x] 3.2 Add the `/webhook/split` route in `src/worker.ts` (404 until configured, 403 on a wrong secret), the three optional bindings in `src/env.ts`, and `SPLIT_BOT_USERNAME` in `wrangler.toml`
- [x] 3.3 Add `test/workers/split-bot.test.ts` through the real pipeline: private and group conversations, another member ignored, route 404 / 403 (the success path needs a live `getMe`, so it is not exercised)

## 4. Documentation and checks

- [x] 4.1 Update README (new Split_PayNow_Bot section with BotFather commands, secrets and `setWebhook`; privacy and group notes; project tree; specs count 18), `AGENTS.md` (architecture bullet, flow list, spec count, change list) and `docs/architecture.md`
- [x] 4.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
