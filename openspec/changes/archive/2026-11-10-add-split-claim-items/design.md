## Context

The receipt flow already produces an assignment (people with item indexes) and `shareReceipt` turns it into amounts. Typing the assignment is the only way to produce it today. A group claim is just another way to produce the same assignment, so the new work is the interaction (a live message that any member can tap), identity (Telegram accounts, not typed names), and safe concurrent updates.

Constraints found in the code: `handleCallback` rejects any tap from a non-owner in groups; updates are accepted at once and run concurrently under `waitUntil`; the conversation Durable Object serialises single requests but the handler does read-then-write across two requests, so two simultaneous taps could overwrite each other; the DO expires a conversation after a fixed 10 minutes of inactivity.

## Goals / Non-Goals

**Goals:** members claim items by tapping; amounts come from the existing maths; claimers can be DMed; simultaneous taps are not lost; claiming can take up to an hour.

**Non-Goals:** removing someone else's claim, partial quantities, claiming in private chats, reminders.

## Decisions

1. **New steps:** `HOW` = 16 (type or claim, group only) and `CLAIM` = 17 (the live message is open). Unclaimed items reuse the existing `UNASSIGNED` step (13) and its `partial` / `unassignedChoice` handling, so the organiser's choice, the "kept while the same items stay unassigned" rule and the shared maths are not duplicated; only a **Keep claiming** button (`split_claim:keep`) is added to that prompt when it comes from claiming. In a private chat the Use this handler sets `assignHow: 'type'`, so `nextNeed` goes straight to `ASSIGN` as today; in a group `nextNeed` returns `HOW` while `assignHow` is unset. Choosing claim sets `assignHow: 'claim'` and `nextNeed` returns `CLAIM` until entries exist.
2. **Claim state in the context:** `claims: { [itemIndex]: string[] }` of claimer ids as strings and `claimers: { [id]: { name, username? } }` plus `claimMsg` (the message id). A tap carries `ctx.from` (id, first name, last name, username), so identity is the Telegram account. Display names are first name, then add the last initial, then the username or a number when two are equal; names are fixed when a person first claims so they do not change under the others.
3. **Callbacks:** `split_how:type|claim`, `split_claim:<i>` (toggle), `split_claim_done`, and for unclaimed items the existing `split_unassigned:even|me` plus `split_claim:keep`. `split_claim:<i>` is the one callback allowed from non-owners; the owner check in `handleCallback` is skipped for it only when the step is `CLAIM` and the tapped message is `claimMsg`. `Done` and the unassigned choice stay owner-only, with a "that is the organiser's button" notice for others.
4. **Concurrent taps:** add `rev` (integer) to the DO state, incremented on every write, and let `POST /state` take an optional `ifRev`; a mismatch returns 409 without writing. A claim tap reads the state, applies the toggle, writes with `ifRev`, and retries on 409 (up to 25 times: each round of simultaneous taps lets one write through, so that many taps at once all fit). This is generic (any handler could use it) and keeps the domain logic out of the DO.
5. **Idle limit per state:** add optional `idleMs` to the state; `alarm()` and `scheduleAlarm()` use `state.idleMs ?? 10 min`. The handler's `setState` writes `idleMs: 3_600_000` for `HOW`, `CLAIM` and (when it came from claiming) `UNASSIGNED` and `600_000` otherwise, because a merge-style write would otherwise keep the old value. Every tap rewrites the state, so each tap restarts the hour.
6. **The claim message:** plain text, one line per item `n. Name SGD x.xx: Ann, Bob` (or `unclaimed`), a short instruction, one button per item (`n. Name (count)`), and a **Done** row. It is edited after each tap with `editMessageText`; "message is not modified" and rate-limit errors are ignored because the stored claims are the truth and the next successful edit shows them. Callback answers ("Claimed", "Removed") give immediate feedback. Items are at most 40 (the existing scan cap), so the keyboard stays within Telegram's limits.
7. **Closing:** Done builds an `Assignment` from the claims. Claimers become people with `userId` set (so the existing DM and waiting-QR paths use the id, with `username` when present); the organiser, if they claimed, is `isMe`. If every item has a claimer the assignment is final. If some do not, the bot sets `partial` and shows the existing unassigned prompt (labels worded for claimers): Leave them out: I cover them adds `me` to each unclaimed item; Split evenly between those who claimed adds every claimer (including the organiser if they claimed) to each unclaimed item (both already implemented by `applyUnassigned`); Keep claiming returns to `CLAIM` and removes the prompt's buttons. At least one non-organiser claimer is required. The assignment goes through `shareReceipt` and `toEntries`, then `entries`, `leftover: 'omit'` and the cleared `partial`/`gap` are set as the typed flow does and `proceed` continues to the payee question and then "Is this payee you?". The organiser's own entry is handled by the existing payee-is-organiser rules, so nothing in claiming decides whether it is collected. The claim message loses its buttons and says claiming is closed.
8. **Limits:** at most 20 distinct claimers; a 21st tap is answered with a notice and records nothing.
9. **Amend → Items:** the pick clears `assignHow` and the assignment so `nextNeed` returns `HOW` in a group (or `ASSIGN` in a private chat), as the existing Items amend does for typing; choosing claim reposts the claim message with the stored claims (a new `claimMsg`; the old message's buttons are removed, so old taps answer "That step is over").
10. **Anonymous admins** post as one account (the group's anonymous admin bot), so they cannot claim separately; the notice says to claim without anonymity. Documented, not solved.

## Risks / Trade-offs

- [Message edit rate limit (about 1 per second per chat) lags the display during a burst] → claims are stored regardless; a later tap refreshes the message; the stored state is what Done uses.
- [A member claims what they did not have] → the organiser sees everything before Confirm, can Amend → Items, and the claim list is visible to the group, which is the social check.
- [Claim state lost after an hour of silence] → stated in the claim message; the organiser starts again.
- [Revision conflicts under load] → bounded retries; the common case (one tap at a time) is a single write.
- [Anyone in the group, including people who are not paying, can tap] → only members can see the message; the organiser reviews names before Done.

## Migration Plan

No data or configuration change. The DO gains optional fields (`rev`, `idleMs`) that old states simply lack. A split in progress during the deploy continues as before.
