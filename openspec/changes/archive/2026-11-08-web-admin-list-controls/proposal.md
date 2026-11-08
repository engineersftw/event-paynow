# Proposal

## Why

The event page loads every payment of an event in one response and draws them all in one long list. That is fine for a few dozen payments, but gets slow and hard to scan as an event grows, and there is no way to find one payer or look at only pending payments.

## What Changes

- The payment list is paged: the API returns the newest 20 payments plus a cursor, and the page shows a "Load more" button while more exist.
- A search field finds payments by payer name or payment reference (case-insensitive, partial match).
- A status filter (All, Pending, Received, Voided) limits the list.
- Search and filter run on the server so they cover payments that are not loaded yet; changing either restarts the list from the top.
- The event totals (collected, paid back, pending) stay event-wide and do not change with the search or filter.
- After an action (received, void, payback), the list refreshes the rows already loaded instead of jumping back to the first page.
- No database migration and no bot change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-admin`: the payment list requirement becomes paged and drops the description; adds requirements for load more, search, the status filter, event-wide totals and request validation.

## Impact

- `src/db/drizzle-repository.ts` and `src/db/repository.ts`: a paged, filtered payment query.
- `src/web/handler.ts` (`eventData`): query parameters, `nextCursor`, totals from `getEventStats`.
- `src/web/page.ts`: toolbar (search, status filter) and the "Load more" button.
- Tests in `test/workers/web-admin.test.ts`, a repository test and `test/node/web-page.test.ts`.
- `AGENTS.md` web admin section; README only if it describes the page list.
