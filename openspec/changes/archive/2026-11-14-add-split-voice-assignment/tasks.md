## 1. Voice reader

- [x] 1.1 Check with a Telegram-style OGG/Opus clip (a throwaway worker under `wrangler dev --remote`; real speech is covered by 4.3) that `@cf/openai/whisper-large-v3-turbo` accepts the OGG/Opus bytes as base64 and returns the words; note the exact request and reply shape in `design.md`. If it does not accept them, stop and report before building anything else
- [x] 1.2 Add `src/voice-reader.ts`: the `VoiceReader` interface, `VoiceReaderError` (stage `hear` or `lines`), and the Workers AI implementation (speech call, then a text call with the numbered item names that answers with only assignment lines, ignoring instructions in the speech; strip code fences and prose around the lines)
- [x] 1.3 Add `VOICE_MODEL` (optional var) to `src/env.ts` and `wrangler.toml`, default the speech model in code
- [x] 1.4 Node tests for the reply clean-up (fenced reply, prose around lines, empty reply) with a fake `Runner`, as `receipt-reader` is tested

## 2. Conversation

- [x] 2.1 `src/split-bot.ts`: add `voice?: VoiceReader` to `SplitBotDeps`, default it from `env.AI`, and route `message:voice` to the handler
- [x] 2.2 `src/commands/split-handler.ts`: `handleVoice` (owner, split flow and ASSIGN step only; silent in groups when ignored; 60 s and 1 MB limits before the download; "listening" notice removed afterwards; heard text and the lines message with **Use these lines**; failures keep the step; log only stage and message)
- [x] 2.3 Store the pending lines as `voice: { lines }` in the context; clear it on a typed answer, a new voice note, leaving ASSIGN and conversation end; add the `split_voice:use` callback that checks the step and pending lines, then runs `readAnswer('assign', …)` and `proceed` exactly as typed text does, and answers a stale tap with "no longer waiting"
- [x] 2.4 Add the voice line to the assignment prompt when a voice reader exists

## 3. Tests

- [x] 3.1 Workers tests in `test/workers/split-bot.test.ts` with a fake `VoiceReader`: spoken assignment then Use these lines gives the same result as typing; sending a second voice note or typed text discards the first lines; a stale button applies nothing; invalid lines (item out of range) re-ask; silent, empty and failing reader; over 60 s and over 1 MB refused before the reader is called; wrong step, non-owner in a group (silent) and no reader configured
- [x] 3.2 Check that no test or log line contains audio bytes or the heard text

## 4. Docs and checks

- [x] 4.1 Update the README (split bot section, `VOICE_MODEL`), `AGENTS.md` and `docs/architecture.md`, and `/help` if it lists input kinds
- [x] 4.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
- [x] 4.3 After deploy, send one real voice note to the live Split bot and record whether the lines were right (Done: a real voice note found the "(shared)" suffix bug, fixed in the follow-up PR; the corrected lines were checked live.)
