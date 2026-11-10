## Context

Bots may message a user only after that user has started the bot, and a message that contains `@ann` carries the text but not Ann's id (a `mention` entity has no user). A mention chosen for a user without a username arrives as a `text_mention` entity with the user object. The web payer page already does best-effort DMs (`sendPaymentDm`, `dm: false` on refusal), so the "try, fall back" pattern exists. The split bot has so far stored nothing; the user has chosen to keep a small contact table and a claim button as the fallback.

## Goals / Non-Goals

**Goals:** mention payers in a custom list; DM each their own QR; give everyone else a one-tap way to get it; keep what is stored small, described and removable.

**Non-Goals:** mentions in equal splits; reminders; tracking payments; reading usernames out of group membership (not possible).

## Decisions

1. **Entries carry identity:** `SplitEntry` gains optional `username` (lowercase, without `@`) and `userId`. `parseCustomList(text, mentions?)` takes the message's `text_mention` entities as a map from the mention text to a user id. A plain `@username` token is recognised by `/^@[A-Za-z][A-Za-z0-9_]{4,31}$/` as the name; a name equal to a `text_mention` entity's text gets that user id. Mentions are exempt from the 20-character name limit (33 characters max) and are unique ignoring case. Edited list messages are parsed the same way using the edited message's entities.
2. **Tables (migration `0002_split_directory`):**
   - `split_contacts(username text primary key, user_id integer not null unique, updated_at text not null)`. One row per user and per username: saving a user deletes their other row and replaces any row for that username.
   - `split_claims(token text primary key, username text, user_id integer, name text not null, amount_cents integer not null, description text, payload text not null, organiser text not null, chat_id integer not null, message_id integer, expires_at text not null)`.
   Both are written through `src/db/split-repository.ts` behind an interface so handler tests can fake it. The payload column holds the SGQR string, which contains the payee; that is the reason claims expire after 48 hours and are deleted when used. Expired rows are purged when a claim is created or read.
3. **Contacts are written only on `/start`** in a private chat (an explicit act) when the user has a username, and removed by `/forget`. A new holder of a username replaces the old record, so a QR cannot go to the previous holder after the new one starts the bot; the remaining window (the old holder still has the username for a moment, or has not started again) is accepted and documented, since the DM contains an amount and a description but no payee number on the image.
4. **Delivery at Confirm** (after the existing `/claim`): split the list into mentioned and plain people. Plain people: one chat QR per distinct amount, exactly as now. Mentioned people: resolve the id (`userId` from a text mention, else the contacts table by username), then `sendPhoto` to that id with a caption such as `Michael asks you for SGD 40.00 (Dinner)` plus the usual reminder to check the payee name. A failure (403 not started or blocked, unknown id) moves the person to the waiting list. DMs are sent one after another; a rate-limit error also moves the person to the waiting list rather than failing the run.
5. **Waiting message:** the bot creates a `split_claims` row (random token, 16 characters from `crypto.getRandomValues`) for each waiting person, sends one chat message "Waiting for their QR: Dee (SGD 25.00)" with a url button per person, `https://t.me/<SPLIT_BOT_USERNAME>?start=claim_<token>`, then stores its `message_id` on the rows. The text and buttons are rebuilt from the rows that still share that message id, so a collection edits the same message (the last one changes it to "Everyone has their QR."). The QR itself is never posted to the chat.
6. **Claiming:** `/start claim_<token>` in a private chat (the command already exists; a payload routes it). The bot loads the row, rejects an expired or missing one ("already collected or expired"), checks identity (`user_id` equals the tapper's id, or the tapper's username equals the row's username ignoring case; a tapper without a username cannot claim a username request), renders the QR from the stored payload with the stored amount lines, sends it, deletes the row, records the tapper as a contact (they have just started the bot), and refreshes the waiting message. A wrong person gets "This QR is for someone else." and nothing changes.
7. **Summary:** mentioned people are marked in the summary (for example `@ann: SGD 40.00 (by direct message)`); the result report after Confirm lists who was sent a DM and who is waiting.
8. **Equal splits and plain custom splits are untouched** and write nothing, which a test asserts.
9. **`/forget`** deletes the caller's contact row and replies "Forgotten." (also when there was none). It does not delete waiting QRs addressed to them; those expire.
10. **Group privacy mode:** nothing new is needed: mentions arrive in the owner's reply to the list prompt; the claim flow happens in private chats.

## Risks / Trade-offs

- [Username reassigned between Telegram users] → the table is refreshed on every `/start`; a claim checks the tapper's current username; documented.
- [Payee number sits in D1 for up to 48 hours] → only inside claim payloads, deleted on use, purged on expiry, disclosed in README.
- [People who started the bot before this feature are unknown] → they get the button once, and their `/start` from the button records them.
- [Telegram refuses a DM for other reasons] → treated as "cannot message", so the person gets a button instead.
- [More messages in a big group] → one waiting message, not one per person.

## Migration Plan

Additive migration; the deploy workflow applies it before the Worker. Rollback: the new tables can stay unused. The README tells operators to add `forget - Delete what the bot remembers about you` to the BotFather commands.
