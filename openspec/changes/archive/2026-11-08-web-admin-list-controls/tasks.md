# Tasks

## 1. Repository

- [x] 1.1 Add `searchPaymentsByEvent(eventId, { status, q, limit, cursor })` to `src/db/repository.ts` and `src/db/drizzle-repository.ts`: keyset order `created_at DESC, id DESC`, `limit + 1` fetch, status filter, literal case-insensitive search on payer name and reference (escaped LIKE)
- [x] 1.2 Repository tests in the workers pool: paging across a created-at tie, status filter, search (case, partial, `%` and `_` literal), filter plus search, last page has no next row

## 2. API

- [x] 2.1 Parse and validate `status`, `q` (at most 40 chars), `limit` (default 20, max 200) and `cursor` in `eventData` (`src/web/handler.ts`); 400 `invalid_request` / `invalid_cursor` otherwise
- [x] 2.2 Return only the page's payments with their paybacks, `nextCursor`, and totals from `getEventStats`; stop summing over the full list
- [x] 2.3 Workers tests in `test/workers/web-admin.test.ts`: first page and cursor, no duplicates after an insert, filter, search, totals unchanged while filtering, validation errors, still no PayNow numbers

## 3. Page

- [x] 3.1 Add the toolbar to `src/web/page.ts`: search input (debounced) and segmented status filter, built with `textContent`, keyboard accessible
- [x] 3.2 Keep `rows`, `nextCursor`, `status` and `q` in script state; add the "Load more" button with de-duplication by `ref`; show "No payments yet." or "No payments match." as appropriate
- [x] 3.3 Refresh after actions with `max(20, rows.length)` rows (cap 200) and the current filter and search, keeping expanded rows
- [x] 3.4 Update `test/node/web-page.test.ts` for the toolbar and Load more markup (still no `innerHTML` or `<form>`, script syntax check)

## 4. Docs and checks

- [x] 4.1 Update the web admin section in `AGENTS.md` (and README if it describes the list)
- [x] 4.2 Check in a browser at 375px with a stubbed API (load more, search, filter, empty states) and run `npm run check`, `npm run build` and `npm test`
