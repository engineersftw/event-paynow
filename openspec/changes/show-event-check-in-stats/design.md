# Design

## Context

The repository already computes event-wide financial totals in `getEventStats`, and the Web Admin API returns those totals independently of the paged, searched payment list. Payments already store nullable `checkedInAt` and expose check-in actions that refresh the list. This change adds aggregate attendance counts without changing payment records or check-in transitions.

## Goals / Non-Goals

**Goals:**

- Compute three event-wide check-in counts in the repository statistics query.
- Return the counts separately from monetary totals in the Web Admin event API.
- Render them as a clear summary on the event page and refresh them through the existing page reload path.
- Preserve void exclusion and the pending/received status distinction.

**Non-Goals:**

- Adding a new check-in state or changing the one-time check-in operation.
- Counting paybacks, monetary values, or attendee identities in the new summary.
- Changing search, filtering, pagination, scan behavior, or payment-row rendering.

## Decisions

### Extend event statistics with check-in counts

Add `checkedInCount`, `notCheckedInPaidCount`, and `notCheckedInPendingCount` to the existing event-stat result rather than introducing a second repository query. Use conditional aggregates over the event's payments: checked-in is `checked_in_at IS NOT NULL` and not voided; the other two require `checked_in_at IS NULL` plus `status = 'received'` or `status = 'pending'`.

This keeps all event-wide totals from one database read and prevents search/filter/paging from affecting attendance counts. A separate endpoint or client-side calculation was rejected because it could drift from the authoritative event scope and add another request.

### Return attendance stats separately from financial totals

Add a `checkInStats` object beside the existing `totals` object in the event API response. The page can then label monetary and attendance figures independently, avoiding ambiguity between SGD totals and payment counts and preserving compatibility for existing consumers of `totals`.

### Render a dedicated attendance summary

Add a three-card attendance summary below the existing financial totals, with labels `Checked in`, `Not checked in (paid)`, and `Not checked in (pending)`. The existing `show()`/`load()` refresh path updates both summaries after check-in and other actions, while search and filter requests continue receiving event-wide statistics.

## Risks / Trade-offs

- [Risk] A payment may be checked in while a list request is in flight. → The next refresh reads the authoritative aggregate; the display may briefly be stale, matching existing list behavior.
- [Risk] A future payment status is added. → The aggregate explicitly counts only pending and received for the two not-checked-in categories and excludes voided, so unknown statuses do not silently inflate a category.
- [Risk] The summary adds vertical space on small screens. → Use the existing responsive card grid and short labels; verify phone-width rendering in page tests.

## Migration Plan

No schema migration is required. Deploy the repository, API, page, and tests together; existing payments with null check-in timestamps naturally appear in the appropriate pending or paid not-checked-in category. Rollback is safe because the new response fields are additive and no stored data changes.
