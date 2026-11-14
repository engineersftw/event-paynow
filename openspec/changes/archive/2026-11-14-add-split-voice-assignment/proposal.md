## Why

After a receipt scan, the organiser has to type who had which item (`1,3 Ann`, `2 Ann, Bob`). People at a table already talk about it ("the pizza was Ann's, the beers were shared"). A voice note lets them say it instead of typing it, and the bot already has the item list and the assignment checks to make the result safe.

## What Changes

- At the assignment step of `/split_receipt`, a Telegram voice note from the organiser is turned into text (Workers AI speech-to-text), then into the existing assignment lines (`1,3 Ann`) using the numbered item list.
- The bot shows what it heard and the lines it made, in their own message with a **Use these lines** button. Nothing is applied until the organiser taps it. To fix a mistake, the organiser sends another voice note or types the lines (the lines message can be copied and edited).
- Tapping the button runs the lines through the same assignment check as typed text, so every existing rule (item numbers in range, people, `me`, `all`, unassigned items) applies unchanged.
- Limits: a voice note over 60 seconds or 1 MB is refused. Audio and the heard text are never stored or logged; the lines wait in the conversation state only until used or replaced.
- Voice notes at any other step, from anyone but the organiser, or when speech-to-text is not configured are ignored with a short reply where the organiser is waiting (or silently in a group, as typed chatter is).
- The assignment prompt mentions that a voice note works.

Out of scope: voice for the payee, amounts, totals or any other step; @mentions by voice (spoken names become typed people); audio files and video notes; new stats counters.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: adds requirements for voice-note assignments in `/split_receipt`.

## Impact

- New `src/voice-reader.ts`: a `VoiceReader` interface and a Workers AI implementation (speech-to-text, then a text model that rewrites the transcript into assignment lines).
- `src/split-bot.ts`: builds the reader from the `AI` binding, routes `message:voice` to the handler.
- `src/commands/split-handler.ts`: `handleVoice`, the **Use these lines** callback, the pending lines in the context, the prompt text.
- `src/env.ts`, `wrangler.toml`: optional `VOICE_MODEL` var (default speech model).
- Tests: `test/node` (rewrite-reply parsing), `test/workers/split-bot.test.ts` (fake `VoiceReader`).
- Docs: README, `AGENTS.md`, `docs/architecture.md`, `/help` if it lists input kinds.
- Workers AI usage grows by two small calls per voice note (the existing `AI` binding; no new secret).
