# Proposal

## Why

The Web Admin page already lets event administrators check attendees in, but it does not provide an at-a-glance view of event attendance progress. Administrators need to distinguish checked-in attendees from paid and pending attendees who still need to check in, while excluding voided payments from the count.

## What Changes

- Add event-wide check-in statistics to the Web Admin event data and page.
- Show counts for checked-in payments, not checked-in received payments, and not checked-in pending payments.
- Exclude voided payments from all three check-in counts.
- Keep the counts independent of the current search, status filter, and pagination state.
- Refresh the statistics whenever the existing payment list refreshes after check-in or other actions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-admin`: The event page gains attendance check-in summary statistics alongside its existing payment totals.
- `payment-tracking`: Event-level check-in aggregation is defined for pending, received, checked-in, and voided payment states.

## Impact

- Event statistics returned by `src/web/handler.ts` and rendered by `src/web/page.ts`.
- Repository/event-stat query types and implementation in `src/db/repository.ts` and `src/db/drizzle-repository.ts`.
- Web Admin node and Workers tests covering status classification, void exclusion, and independence from search/filter/paging.
- README or web documentation only if the displayed Web Admin statistics need to be documented for operators.
