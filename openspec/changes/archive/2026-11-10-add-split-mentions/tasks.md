## 1. Data layer

- [x] 1.1 Add `splitContacts` and `splitClaims` to `src/db/schema.ts`, generate `drizzle/0002_split_directory.sql` with `npm run db:generate -- --name split_directory`, format `drizzle/meta` with Biome, and add both tables to the workers test schema in `test/workers/harness.ts`
- [x] 1.2 Add `src/db/split-repository.ts` (interface `SplitDirectory` and a D1 implementation): save contact (replacing the user's and the username's earlier rows), find contacts by usernames, forget by user id, create claim, get claim, delete claim, claims for a message, set message id, purge expired
- [x] 1.3 Test the repository in `test/workers/split-repository.test.ts`: replace on username change, one row per user, forget, claim round trip, purge of expired rows

## 2. Mentions in the list

- [x] 2.1 Extend `SplitEntry` with `username` and `userId`; make `parseCustomList` recognise `@username` names and `text_mention` entities (case-insensitive uniqueness, 33-character mention limit), and use the edited message's entities when a list is edited
- [x] 2.2 Extend `test/node/split-math.test.ts`: username mention, text mention, mixed list, duplicate mention ignoring case, a long mention accepted and a long plain name still refused

## 3. Delivery and claim

- [x] 3.1 In `src/commands/split-handler.ts` take a `SplitDirectory` and the bot username; at Confirm split the list into plain and mentioned people, keep the chat QRs for plain people, and DM each resolvable mentioned person (caption names the organiser, amount and description; never the payee number); move refused or unknown people to the waiting list
- [x] 3.2 Create a claim row per waiting person, post one waiting message with a Get my QR url button per person (`https://t.me/<bot>?start=claim_<token>`), store the message id on the rows, and post the result report (sent and waiting names)
- [x] 3.3 Mark mentioned people in the summary as sent by direct message
- [x] 3.4 In `src/split-bot.ts` handle `/start claim_<token>` (checks identity, sends the QR, deletes the row, records the contact, refreshes the waiting message; answers wrong person, expired and already collected), record a contact on a plain private `/start`, and add `/forget`

## 4. Tests and docs

- [x] 4.1 Extend `test/workers/split-bot.test.ts`: all mentioned and known (DMs only, no chat QR), mixed list, unknown person gets a button and collects, wrong person refused, collected twice, expired, DM refused falls back to a button, text mention with an id, `/start` records and replaces a contact, `/forget`, and no rows written for an equal or plain custom split
- [x] 4.2 Update README (what the bot keeps, `/forget`, the BotFather list, mentions in the custom list, the 48-hour claim), `SPLIT_HELP`, `AGENTS.md` and `docs/architecture.md`
- [x] 4.3 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
