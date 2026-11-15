## Why

Voice notes already work for "who had what", but they are hidden: the only hint is one sentence at the end of the typing prompt. In a group the organiser sees a menu with two buttons ("I'll type who had what", "Let everyone claim their items") and no sign of voice; in a private chat there is no menu at all. A voice note is the quickest way to share out a receipt, so it should be a choice on the menu, not a footnote.

## What Changes

- The "How do you want to share out the items?" menu gains a button, **Say it with a voice note**, shown whenever voice is available (the `AI` binding exists).
- The menu is shown in **private chats too** when voice is available: "I'll type who had what" / "Say it with a voice note". Groups keep their claiming button, so they get three buttons. Without voice, nothing changes (groups: type or claim; private chat: straight to typing).
- Tapping the voice button sends the numbered item list and a short prompt that says how to speak it (with an example), that the bot will show what it heard and the lines before using them, and offers **Type instead**. In a group the prompt is a reply prompt, so voice notes reach the bot with privacy mode on.
- A voice note sent while the menu is shown counts as choosing voice and is read at once.
- Amend → Items shows the same menu again.
- The voice reading, the **Use these lines** confirmation and the checks are unchanged.

Out of scope: voice at any other step, other languages, new stats counters, changing the claim flow.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: the how-to-share-out menu includes voice and appears in private chats; the voice prompt; a voice note at the menu; Amend Items reopens the menu; voice notes are also accepted at the menu.

## Impact

- `src/commands/split-handler.ts`: `nextNeed` and the scan's Use this (a menu flag in the context), the `HOW` prompt and its `split_how:voice` / `split_how:retype` callbacks, the voice prompt in the `ASSIGN` step, `handleVoice` at the `HOW` step, Amend → Items.
- Tests: `test/workers/split-bot.test.ts` and `test/workers/split-voice.test.ts` (existing private-chat receipt tests run without a voice reader, so they keep their flow; voice tests get the menu step).
- Docs: README, AGENTS.md, docs/architecture.md, `/help`.
- Behaviour change: with voice configured, private chats get one extra tap after Use this ("I'll type who had what"), and existing flows that tap through a private receipt split see the menu.
