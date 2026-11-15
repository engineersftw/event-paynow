## Context

After Use this, `nextNeed` returns `HOW` only when the context has `group: true` and no `assignHow` yet; `HOW` shows "I'll type who had what" (`split_how:type`) and "Let everyone claim their items" (`split_how:claim`), which set `assignHow` and move to `ASSIGN` or `CLAIM`. A private chat skips `HOW`. Voice (`handleVoice`, `voiceUse`, the `voice` context) works only at `ASSIGN`, and the typing prompt ends with one sentence about it when `this.receipts.voice` exists. Amend → Items goes to `HOW` for a group and `ASSIGN` otherwise. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- Voice is a visible choice wherever the organiser decides how to share out the items.
- One extra tap at most; nothing changes where voice is not available.

**Non-Goals:**
- Changing how a voice note is read, confirmed or checked; other steps; other languages.

## Decisions

**A `askHow` flag decides whether the menu shows.** At Use this the handler sets `askHow: isGroup(ctx) || voiceAvailable` next to the existing `group` flag (`group` stays: the claim flow and Amend read it). `nextNeed` uses `c.askHow && !c.assignHow` for `HOW`, and Amend → Items uses `c.askHow ? HOW : ASSIGN`. The flag is stored so the answer does not change if the binding flips mid-split. Alternative: compute it in `nextNeed` from the environment. Rejected: `nextNeed` is a pure function of the context.

**Buttons built from what is available.** `HOW` shows "I'll type who had what", then "Say it with a voice note" when voice exists, then "Let everyone claim their items" when `c.group`. One button per row, as today.

**Voice is an `assignHow` value.** `split_how:voice` sets `assignHow: 'voice'` and moves to `ASSIGN`. Everything downstream already treats anything other than `'claim'` as typed (`UNASSIGNED` checks `=== 'claim'`; `nextNeed` checks `=== 'claim'`), so `'voice'` needs no other change. The `ASSIGN` step shows the voice prompt when `c.assignHow === 'voice'`: the item list bubble first (as today), then "Hold the microphone and say who had which item, for example: …" with the numbered names of the first two items, the sentence that the bot will show what it heard and the lines before using them, "You can also type it", and a **Type instead** button (`split_how:retype`). Alternative: a separate step number. Rejected: the step is the same (waiting for the assignment); only the prompt differs.

**Type instead.** `split_how:retype` is valid at `ASSIGN` (the `expected` chain gets one more entry): it sets `assignHow: 'type'` and re-asks the typing prompt. A tap at any other step is stale, as for every other button.

**A voice note at the menu is a choice.** In `handleVoice`, when the state is `HOW` and voice is available, the handler first moves the state to `ASSIGN` with `assignHow: 'voice'` (and removes the menu buttons), then reads the note as usual. Without that, the existing "I only take a voice note when I ask who had which item" reply would greet someone who answers the menu by speaking.

**Group privacy.** The voice prompt has a button, so `ask()` appends "(reply to this message)" (as it does for every button prompt in a group): voice notes sent as a reply reach the bot with privacy mode on, which is how the existing group prompts work.

**Typing prompt.** The one-line voice hint at the end stays (it is harmless and covers a split that reaches `ASSIGN` without the menu, such as Amend in an old conversation).

## Risks / Trade-offs

- **One more tap in private chats with voice.** The price of making voice visible; a typed-first user taps "I'll type who had what". Accepted (chosen).
- **Conversations in progress at deploy** have no `askHow`; they behave as before (menu only for groups via `group`). To keep that, `nextNeed` treats a missing `askHow` with `group: true` as true.
- **Voice not available mid-split** (binding removed): the `HOW` menu is rebuilt from the current environment, so the voice button disappears; a split already at voice `ASSIGN` is told voice is not available if the organiser sends a note, as today.
