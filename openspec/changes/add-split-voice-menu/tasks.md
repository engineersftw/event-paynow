## 1. The menu

- [x] 1.1 In `src/commands/split-handler.ts` set `askHow: isGroup(ctx) || voice available` at Use this (and drop it from the cleared keys of a new scan), make `nextNeed` return `HOW` for `(c.askHow ?? c.group) && !c.assignHow`, and make Amend → Items go to `HOW` under the same rule
- [x] 1.2 Build the `HOW` buttons from what is available: type, then "Say it with a voice note" when `this.receipts.voice` exists, then claiming for groups; handle `split_how:voice` (sets `assignHow: 'voice'`, edits the menu message to "You will say who had what.", moves to `ASSIGN`)
- [x] 1.3 Check the `expected`-step chain, the group owner-only rules and the "buttons only" replies for the new callback data, so stale taps behave like any other

## 2. The voice prompt

- [x] 2.1 In the `ASSIGN` step, when `assignHow === 'voice'`, send the item list bubble and then the voice prompt (what to say, an example built from the first items, the "I will show you what I heard first" sentence, "You can also type it") with a **Type instead** button; keep the typed prompt otherwise
- [x] 2.2 Handle `split_how:retype` at `ASSIGN` (sets `assignHow: 'type'`, edits the voice prompt away and asks the typed prompt)
- [x] 2.3 In `handleVoice`, when the step is `HOW` and voice is available, move to `ASSIGN` with `assignHow: 'voice'` (and drop the menu buttons) and read the note as usual

## 3. Tests

- [x] 3.1 Menu tests: group with voice (three buttons), private chat with voice (two buttons), group without voice (two, as before), private chat without voice (no menu); the existing private-chat receipt tests keep their flow (their bots have no voice reader)
- [x] 3.2 Voice tests: tapping the voice button sends the list and the prompt with Type instead; Type instead shows the typed prompt; typed text after choosing voice is read as typed; a voice note at the menu is read as a choice; Amend → Items reopens the menu; update `split-voice.test.ts`'s `toAssign` for the new step
- [x] 3.3 A stale `split_how:voice` or `split_how:retype` tap changes nothing

## 4. Docs and checks

- [x] 4.1 Update README (Split receipt section and `/help` text), AGENTS.md and docs/architecture.md for the menu and the voice prompt
- [x] 4.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
- [ ] 4.3 After deploy, run one receipt split in a private chat and in a group: the menu shows voice, a voice note is read, Type instead works
