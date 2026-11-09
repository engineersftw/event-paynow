# Proposal

## Why

Events usually have a page somewhere else (a sign-up form, a venue map, a Facebook event). Today the bot, the admin page and the payment page know only the event's name, payee and amount, so attendees who land on the payment page have no way to get back to the event's own page, and organizers cannot connect the two.

## What Changes

- `/init` asks for an **optional event website URL** after the default amount and before the confirmation, with a Skip button. The URL is validated (web addresses only), normalised and stored on the event; the confirmation summary and the success message show it.
- `/edit_event` gets a **Website** field next to Name, Payee and Default amount, to set, change or clear the link; the result message shows all the final values, as for the other fields.
- The **Web Admin page** and the **Web Payment page** show the link under the event title.
- Validation: only `http` and `https`, no embedded username or password, no spaces, at most 200 characters, and a host with a dot. An address typed without a scheme gets `https://`. Anything else is rejected with a re-prompt. The link is shown as its host name, opens in a new tab and is marked `noopener noreferrer nofollow`.
- One additive migration, `0001_event_website`, adds a nullable `events.website_url` column. Existing events have none and work as before.

Out of scope: checking that the address is reachable, link previews, several links, a link on QR captions or in `/payments`, showing the link in Telegram messages beyond the `/init` and `/edit_event` summaries.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `event-management`: events can have a website link; `/init` asks for it; `/edit_event` can change it.
- `web-admin`: the event page shows the link.
- `event-payment-page`: the payment page shows the link.

## Impact

- New: `src/commands/website-url.ts` (validation and normalising), migration `drizzle/0001_event_website.sql` (the first after the squashed baseline) with its snapshot.
- Changed: `src/db/schema.ts`, `repository.ts`, `drizzle-repository.ts` (event type, create, update, mapping), `src/commands/init-handler.ts` (new step, so the confirmation moves from step 4 to 5), `src/commands/edit-event-handler.ts`, `src/web/handler.ts` (event JSON carries `websiteUrl`), `src/web/page.ts` (both pages), the test schema harness, tests (existing `/init` tests gain the extra step), README, AGENTS.md, `docs/architecture.md`.
- Worker and Pages deploy plus an additive migration (the migrate job runs first). No new secrets.
