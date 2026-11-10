## Why

In a custom split the organiser lists names, and then everyone has to find their own QR in the chat. In a busy group that is slow, and the QRs (amount, description) are visible to everyone. If the organiser can @ mention each payer, the bot can send each person only their own QR as a direct message.

## What Changes

- In a custom list a payer can be an **@username** (`@ann 40`) or a Telegram mention picked from the member list (a "text mention" for people without a username), as well as a plain name. Lists may mix them.
- On Confirm, the bot **sends each mentioned person their own QR as a direct message** from the bot, with the amount, the description and the organiser's name. Plain-name people still get a shared QR per distinct amount in the chat, as today.
- A Telegram bot can only message someone who has started it, and an @username does not reveal the person's id. So:
  - The bot **remembers people who have started it**: a small table maps Telegram username to user id, written when someone sends `/start` to the bot in a private chat. `/forget` removes it. Text mentions carry the id directly.
  - A mentioned person the bot cannot message (not known, or has blocked the bot) is added to **one "waiting" message** in the chat with a **Get my QR** button per person. The button opens the bot's private chat; after `/start` the bot checks that the person is the one mentioned and sends their QR by DM. The QR is never posted in the group.
  - The waiting message updates as people collect, and unclaimed requests expire after 48 hours.
- To make the later hand-over possible the bot must keep the QR details of a waiting person (amount, description, the payee inside the QR payload, the organiser's name, chat and message ids) until collected or expired. This changes the earlier promise that the bot stores nothing; the spec, README and `/help` say exactly what is kept.
- The summary marks mentioned people as sent by DM and says who will get a button.

Out of scope: mentions in equal splits, sending to people in the list who are not mentioned, reminders to people who have not collected, tracking who paid, and `/stats`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `bill-split-bot`: the custom list accepts mentions; mentioned people receive their QR by DM; people who cannot be messaged get a Get my QR button; the bot keeps a small contact table and short-lived pending QRs instead of storing nothing.

## Impact

- New migration `drizzle/0002_split_directory.sql` (two tables: `split_contacts`, `split_claims`), `src/db/split-repository.ts`, schema additions in `src/db/schema.ts`. Additive, so safe to deploy ahead of the code.
- Changed: `src/commands/split-math.ts` (mention parsing and the entry shape), `src/commands/split-handler.ts` (resolve mentions, DM, waiting message, claim), `src/split-bot.ts` (`/start claim_<token>`, `/forget`, contact upsert), `test/node/split-math.test.ts`, `test/workers/split-bot.test.ts`, the workers test schema in `test/workers/harness.ts`.
- No new secret or dependency. Uses the existing `SPLIT_BOT_USERNAME` var for the deep link.
- Docs: README (data kept, `/forget`, the BotFather command list), `AGENTS.md`, `docs/architecture.md`. The deploy workflow runs the migration automatically.
- Privacy: the bot now holds usernames with user ids, and for up to 48 hours the payee inside a waiting QR. Both are described to users and deletable.
