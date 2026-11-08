# Design

## Context

`eventData` in `src/web/handler.ts` calls `listPaymentsByEvent` (all rows), `listPaybacksByEvent`, `sentPaybackTotalsByEvent`, and sums totals in JavaScript over the full list. `getEventStats` already computes event-wide collected, pending and paid-back totals in SQL. The page (`src/web/page.ts`) renders `d.payments` in one go and reloads everything after each action. Access control, the same-origin guard and attribution are unchanged.

## Goals / Non-Goals

**Goals:** server-side paging with "Load more", search by payer name or reference, status filter, correct event-wide totals, stable behaviour after actions.

**Non-Goals:** searching by PayNow number (the page never exposes numbers), sorting options, date filters, infinite scroll, a migration or new index, changing the bot's `/payments` paging.

## Decisions

1. **Keyset cursor, not offset.** Order is `created_at DESC, id DESC`. The cursor is `<createdAt>|<id>` of the last row; the next page is `created_at < ? OR (created_at = ? AND id < ?)`. A payment created while browsing cannot shift rows into duplicates, unlike offsets. The server fetches `limit + 1` rows to know whether another page exists, and returns `nextCursor` or `null`. Cursors are validated against `^[^|]+\|\d+$`; anything else is a 400 `invalid_cursor`. The client also de-dupes by `ref` as a belt and braces.
2. **One repository method.** `searchPaymentsByEvent(eventId, { status?, q?, limit, cursor? })` builds the `WHERE` with bound parameters. `listPaymentsByEvent` stays for the bot. Search is `lower(payer_name) LIKE ? ESCAPE '\'` OR `lower(ref) LIKE ? ESCAPE '\'` with `%`, `_` and `\` escaped, so input matches literally. SQLite LIKE is already case-insensitive for ASCII; lowering both sides keeps that explicit. No index: a scan of one event's rows is small and D1 reads are cheap.
3. **Query parameters.** `GET /api/events/:ref?status=&q=&limit=&cursor=`. `status` must be `pending|received|voided` (absent = all). `q` is trimmed, at most 40 characters. `limit` defaults to 20 and is capped at 200 (used only by the refresh below). Invalid values return 400 `invalid_request`.
4. **Totals from `getEventStats`.** Replace the JavaScript sums with `getEventStats(event.id)` (collected net of sent paybacks, paid back, pending, voided excluded), so totals no longer depend on the loaded rows and ignore search and filter.
5. **Paybacks for the page only.** A new `listPaybacksByPayments(ids)` reads only the paybacks of the payments on the page, in chunks of 90 ids to stay under D1's 100 bound-parameter cap (at most 3 queries at the 200-row cap). The per-payment sent totals are summed from those same rows, so the page no longer calls `sentPaybackTotalsByEvent` or reads the rest of the event's paybacks. `listPaybacksByEvent` has no remaining caller and is removed.
6. **Page state and refresh.** The script keeps `rows`, `nextCursor`, `status` and `q`. "Load more" fetches with the cursor and appends. After an action the page refetches the first `max(20, rows.length)` rows (capped at 200) with the current filter and search, replacing `rows` and `nextCursor`, so the view stays in place. Changing the filter or search clears `rows` and loads the first page. Expanded-row state (`open`) is kept.
7. **Toolbar UI.** Below the totals: a search input (debounced 300 ms) and a segmented status filter (All, Pending, Received, Voided) with 40px touch targets, in the existing token styles; the active segment uses the primary style. Empty states: "No payments yet." when the event has none and nothing is filtered, "No payments match." otherwise. "Load more" is a full-width outline button under the list.

## Risks / Trade-offs

- The refresh after an action refetches up to 200 rows; a user who loaded more than 200 sees the list reset to 200 with "Load more" continuing.
- Search by name only matches the name snapshotted on the payment; unnamed payments are found by reference.
- Keyset paging relies on `created_at` being a sortable ISO string, which it is today.
