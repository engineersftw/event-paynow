# Design

## Context

- `/init` (`src/commands/init-handler.ts`) runs steps 1 name, 2 payee, 3 optional default amount (typed text or the `init_skip_amount:<userId>` button), 4 Confirm / Cancel; the Confirm and Skip callbacks check the current step. `/edit_event` (`edit-event-handler.ts`) picks an event, then a field (`name`, `payee`, `amount`), then takes the value; amount can be cleared.
- `events` has `default_amount_cents` (nullable, added by an earlier migration, now part of the squashed baseline `0000_initial_schema.sql`). The next migration is the first after the squash, `0001`.
- Event JSON for the web pages is built in `src/web/handler.ts` (`eventData` for the admin page, `payerData` for the payment page); both pages set the title from it (`'Event: ' + name`, `'Pay: ' + name`) and build DOM with `textContent`.
- The payment page is public: anyone with the link sees what the event stores. A link set by the organizer therefore appears on a page about paying someone.

## Goals / Non-Goals

**Goals:** an optional, validated website link on events, settable in `/init` and `/edit_event`, shown on the admin and payment pages, with no risk of script injection or hijacking the opened page.

**Non-Goals:** reachability checks, previews, several links, showing the link on QR captions, `/payments` or the social preview tags.

## Decisions

1. **Column:** `events.website_url TEXT` (nullable), additive migration generated with `npm run db:generate -- --name event_website` as `0001_event_website.sql`; the test schema in `test/workers/harness.ts` and the column list in `test/node/migration.test.ts` gain the column. `Event` gets `websiteUrl: string | null`; `createEvent` takes an optional `websiteUrl`; `EventPatch` gets `websiteUrl?: string | null` (null clears); the Drizzle repository maps the column. Existing rows read as `null`.
2. **One validator, `normalizeWebsiteUrl(input): string | null`** in `src/commands/website-url.ts`, used by `/init` and `/edit_event`: trim; reject anything with whitespace inside or longer than 200 characters; if there is no `scheme:` prefix add `https://` (so `example.com/x` works, but `javascript:alert(1)` is seen as a scheme and rejected); parse with `new URL`; accept only `http:` and `https:`, a host containing a dot, and no username or password; return the parsed `href` (host lowercased, so `https://example.com` is stored as `https://example.com/`). Returns `null` for anything else, so callers just re-prompt.
3. **`/init` gets step 4, website; Confirm moves to step 5.** After a valid amount or the amount Skip button the flow goes to step 4 and asks "🔗 Event website (optional)…" with a Skip button (`init_skip_website:<userId>`); a typed address goes through the validator (invalid: re-prompt, no advance). The Confirm and Cancel callbacks and their step guards move to step 5. The context key is `websiteUrl`. The confirmation summary and success message show `🔗 Website: <url>` when set. Existing `/init` tests step through confirmation, so they gain one Skip or address step.
4. **`/edit_event` gets a Website field:** a fourth button after Default amount; `askValue` prompts for an address (with a Clear button when one is set, like the amount); a valid address is saved through `updateEvent({ websiteUrl })`, and Clear saves `null`. The reply lists all the final values including the website (or "none"), marking the changed field.
5. **Event JSON carries `websiteUrl`:** `eventData` (admin) and `payerData` (payer) add it to the `event` object. No other API changes.
6. **Pages:** both pages get a hidden `<p id="site" class="muted sm">` under the title. In the script, after the data arrives: if `d.event.websiteUrl` matches `/^https?:\/\//` (checked again on the client as defence in depth) build an `<a>` with `textContent` set to the URL's host (via `new URL(...).host`), `href` set from the value, `target="_blank"` and `rel="noopener noreferrer nofollow"`, preceded by the text "Event website:", and reveal the paragraph; otherwise leave it hidden. All DOM construction uses `textContent` and `setAttribute`, never `innerHTML`, as the rest of the page does. For a closed event the payment page shows the link beside the closed notice (the title and notice already render for closed events).
7. **Showing the host, not the full URL:** it tells the visitor where the link goes, keeps the line short on a phone, and the full address is in the `href`.
8. **Tests:** unit tests for `normalizeWebsiteUrl` (valid with and without scheme, uppercase host, query and fragment; rejected: `javascript:`, `data:`, `mailto:`, `ftp:`, credentials, spaces, `localhost`, no dot, empty, 201 characters); `/init` flow tests (set, skip, invalid re-prompt, no scheme normalised, cancel stores nothing, summary and success message show it) and the existing tests adjusted; `/edit_event` tests (set, clear, invalid rejected, final values shown); repository tests (create with and without, update, clear); web handler tests (admin and payer JSON include `websiteUrl`, null when none); page tests (the script builds the link only for http and https values with the safe `rel`, hidden by default).
9. **Verification:** Playwright at 320 and 390 px, light and dark, on both pages with and without a link (wraps cleanly, no overflow), and a check that a stored `javascript:` value in the stub is not turned into a link.

## Risks / Trade-offs

- **A public page can now point visitors elsewhere.** Anyone who can run `/init` or `/edit_event` (chat administrators for editing) can put a link on the payment page. Mitigations: web schemes only, no credentials, the host is shown, `nofollow`, new tab with no opener. It cannot execute script. An organizer could already put any text in the event name.
- **A new step in `/init`** adds one more prompt for everyone, though Skip keeps it to one tap.
- **Existing `/init` tests must change** because the confirmation moves from step 4 to 5; this is the main churn.
- **Stored form differs from typed form** (`https://` added, trailing slash on a bare host, lowercased host); the summary shows the stored form so there is no surprise.
- **`localhost` and bare names are rejected** (host must contain a dot), which also rejects internal hostnames; acceptable for public event pages.
