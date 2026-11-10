## Why

After a receipt scan, the organiser has to type who had which item (`1,3 Ann`, `2 Ann, Bob`, or a pasted list with a name above each group). In a group that is the slowest and most error-prone step: the organiser must remember what everyone ate, and people argue afterwards. If each person can tap the items they had, the organiser does nothing, everybody checks their own items, and the amounts come from the same pro-rata maths as before.

## What Changes

- In a **group chat**, after the organiser taps **Use this** on a scan (which deletes the review message), the bot asks how to assign items: **I'll type it** (today's flow: the item list in its own message, then the instructions) or **Let everyone claim**. Private chats are unchanged.
- **Let everyone claim** posts one message listing the numbered items with the people who have claimed each, and one button per item. **Any group member** taps an item to claim it and taps again to un-claim. An item claimed by several people is split equally between them. The message updates after each tap. Members are identified by their Telegram account, so claimers can later receive their QR by direct message.
- Only the organiser can close the claiming with **Done**. If some items are unclaimed, the bot asks the organiser with the same question the typed flow already uses for unassigned items (the existing `UNASSIGNED` step and `split_unassigned:*` callbacks): **Split evenly between those who claimed**, **Leave them out: I cover them**, plus a new **Keep claiming**. Nothing is guessed. Done needs at least one person other than the organiser to have claimed something.
- The organiser can claim items too. Their share is counted as `me` is today: not collected when the organiser is the payee, and otherwise paid to the payee through their own QR (the "Is this payee you?" question that follows the claiming decides which).
- Closing computes each person's amount exactly as the typed assignment does (items split equally, service charge and GST shared in proportion, amounts adding up to the receipt total) and continues as the custom split: payee, "Is this payee you?", description, summary with Confirm / Amend / Cancel, DMs and chat QRs. People who cannot be messaged get the existing **Get my QR** button.
- Amend → Items reopens the choice (type or claim); earlier claims are kept.
- While items are being claimed the conversation stays open for **1 hour of inactivity** (every tap resets it) instead of 10 minutes, because people finish dinner at different speeds. All other steps keep the 10-minute limit.
- Simultaneous taps are all recorded (the conversation state gets a revision check so two taps cannot overwrite each other).

Out of scope: letting the organiser remove someone else's claim, claiming in private chats, claiming part of an item (quantity splits other than equal sharing), reminders to people who have not claimed, and any new `/stats` counters (the existing `split_*` counters still count the split when it is confirmed).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `bill-split-bot`: item claiming by group members, the organiser's Done and unclaimed-item choices, a longer idle limit while claiming, and the owner-only rule's exception for claim taps.

## Impact

- Changed: `src/commands/split-handler.ts` (new steps HOW and CLAIM after the current last step number 15, reusing `UNASSIGNED` for unclaimed items; claim taps from any member; building the assignment from claims), `src/commands/receipt.ts` (an assignment built from claims), `src/worker/conversation-do.ts` (a `rev` revision with a conditional write, and a per-state idle limit), tests.
- No database change, no new secret or dependency.
- Docs: README (group claiming, the 1-hour limit), `AGENTS.md`, `docs/architecture.md`.
- Taps are processed concurrently (the webhook answers Telegram at once and runs each update under `waitUntil`), which is why the revision check is needed.
- Risks: Telegram limits message edits (about one per second per chat), so a burst of taps may lag the displayed message while the stored claims stay correct; anonymous group admins appear as one account and cannot claim separately.
