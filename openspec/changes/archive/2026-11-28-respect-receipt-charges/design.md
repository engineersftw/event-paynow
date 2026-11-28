# Design

## Context

The current exact-share calculation scales items by total divided by scanned item sum, treating every gap as an adjustment. The existing specification explicitly describes this behavior, including early claims. The example receipt has GST 0.00 and a modifier total; its screenshot is consistent with incomplete scanned items, but the model output is unavailable.

## Goals / Non-Goals

**Goals:** Reconcile receipt data before issuing amounts, preserve proportional allocation for actual adjustments, and keep typed and claim paths consistent.

**Non-Goals:** Change rounding policy or store receipt images.

## Decisions

Use explicit scanned charges and discount with item totals to check reconciliation. Offer correction of missing items or adjustments and prevent continuation until reconciled; silently scaling an unexplained gap would distribute an unknown amount. Treat a printed modifier as an item or explicit adjustment only when the organiser can verify its treatment. Keep a shared calculation for typed assignments, claims and early QR, retaining exact fractions and upward cent rounding. Handle already active conversations defensively when deploying, including fixed early shares.

## Risks / Trade-offs

- [Receipt scans can omit or misclassify adjustments] → Make the discrepancy and correction path visible.
- [Receipt rounding can cause small differences] → Provide an explicit correction rather than silently calling it GST.
- [In-flight claims may have fixed early amounts] → Preserve already issued amounts and avoid changing their allocation mid-flow.

## Migration Plan

Deploy with compatibility for existing conversation state; rollback restores prior behavior for new flows. No database migration is expected.
