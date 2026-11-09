# Tasks

## 1. Repository and event statistics

- [x] 1.1 Extend the event statistics type and D1 aggregate query with checked-in, not-checked-in-paid, and not-checked-in-pending counts; verify existing financial totals remain unchanged and repository tests cover pending, received, checked-in, and voided rows.
- [x] 1.2 Add Workers repository coverage for mixed check-in states, zero counts, and checked-in payments retaining their status/amount/payback totals; verify voided payments contribute to none of the new counts.

## 2. Web Admin API and presentation

- [x] 2.1 Return the event-wide check-in counts in the Web Admin event API separately from financial totals; verify the response is unchanged by search, status filter, and pagination parameters.
- [x] 2.2 Add a three-card attendance summary to the Web Admin page labeled Checked in, Not checked in (paid), and Not checked in (pending); verify the page shell and client script render all labels and refresh values through the existing load path.
- [x] 2.3 Add or update Web Admin tests for mixed states, void exclusion, filter/search independence, and check-in refresh behavior; verify existing check-in and payment-list behavior remains intact.

## 3. Verification and documentation

- [x] 3.1 Update operator-facing Web Admin documentation if needed to describe the new attendance summary; verify the documented labels and void-exclusion rule match the page.
- [x] 3.2 Run `npm run check`, `npm run build`, and `npm test`; verify all node and Workers tests pass.
