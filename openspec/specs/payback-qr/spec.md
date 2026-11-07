# Payback QR Specification

## Purpose

Generates a payback SGQR for a tracked payment in which the original payer becomes the payee, so the user who collected the payment can scan it in their own bank app and send the money back.

## Requirements

### Requirement: Initiate payback from a payment

The system SHALL let the owning user trigger a payback from a payment record, asking for the payer's PayNow reference (mobile number or UEN) and the payback amount, and SHALL validate both before generating a QR.

#### Scenario: Payback initiated from received payment

- **WHEN** the owning user triggers payback on a payment and provides a valid payer reference and a valid amount not exceeding the original payment amount
- **THEN** the system generates a payback QR encoded with the payer's reference as the payee, the payback amount, and a payback reference, delivered as an inline image

#### Scenario: Payback amount exceeds original

- **WHEN** the user enters a payback amount greater than the original payment amount
- **THEN** the system rejects the amount, prompts for a new value, and creates nothing

#### Scenario: Invalid payer reference

- **WHEN** the user enters a payer reference that is neither a valid SG mobile number format nor a valid UEN format
- **THEN** the system rejects the input with an explanatory error and re-prompts

### Requirement: Payback recorded against the payment

The system SHALL record each generated payback with its amount, payer reference, timestamp, and status (default `pending`; markable as `sent` or, while pending, `cancelled`), linked to the original payment, and SHALL show payback history on that payment, excluding cancelled paybacks from the payback totals.

#### Scenario: Partial payback history

- **WHEN** a user issues two paybacks of 5.00 and 3.00 against a 12.50 payment and views the payment
- **THEN** the payment detail shows both paybacks with amounts and statuses and the remaining payable total of 4.50

#### Scenario: Mark payback as sent

- **WHEN** the owning user marks a pending payback as sent
- **THEN** the payback status updates to `sent` with a timestamp and the payment detail reflects it

#### Scenario: Cancelled payback in history

- **WHEN** a payment has paybacks of 5.00 (sent) and 3.00 (cancelled) and the user views the payment
- **THEN** the detail shows both, marks the 3.00 as cancelled, and reports total payback 5.00 and remaining 7.50 for a 12.50 payment

### Requirement: Paybacks bounded by payment amount

The system SHALL NOT allow the total of `pending` and `sent` paybacks against a payment to exceed the original payment amount. `cancelled` paybacks SHALL NOT count toward the total.

#### Scenario: Over-payback blocked

- **WHEN** paybacks already total 12.50 for a 12.50 payment and the user requests another payback
- **THEN** the system refuses with a message that the payment has been fully paid back

#### Scenario: Cancelled payback frees its amount

- **WHEN** a 12.50 payment has a single cancelled payback of 12.50 and the user requests a new payback of 12.50
- **THEN** the system accepts it

### Requirement: Payback uses the payer stored on the payment

When a payment has a stored payer proxy, the system SHALL propose it as the payback recipient at initiation (via `/payback <ref>` or the **Payback** button) with **✅ Confirm**, **✏️ Change recipient** and **❌ Cancel** buttons. Confirming proceeds to the amount step. Payments with no stored payer SHALL keep the existing payer-reference prompt.

#### Scenario: Confirm stored payer

- **WHEN** the owner runs `/payback <ref>` (or taps **Payback**) on a received payment whose payer is `+6591234567` and taps **Confirm**
- **THEN** the bot asks for the payback amount and, on confirmation, generates a QR with `+6591234567` as payee

#### Scenario: Legacy payment without payer

- **WHEN** the owner starts a payback on a payment with no stored payer
- **THEN** the bot prompts for the payer's PayNow reference as before

#### Scenario: Button and command behave the same

- **WHEN** a payback is started from the **Payback** button instead of `/payback <ref>`
- **THEN** the conversation state carries the same payment id, amount, and payer, so the confirm and amount steps work identically

### Requirement: Recipient can be changed per payback

The system SHALL let the owner replace the proposed recipient with a different PayNow mobile/UEN (same validation and confirm step as the payer prompt). The replacement MUST apply to that payback only, MUST NOT overwrite the payer stored on the payment, and MUST be the payee of the QR and the `paybacks` row.

#### Scenario: Change recipient

- **WHEN** the owner taps **Change recipient** and enters a valid different proxy `+6598765432`, then confirms it
- **THEN** the bot asks for the amount, the QR and `paybacks` row use `+6598765432`, and the payment's stored payer is unchanged

#### Scenario: Invalid replacement recipient

- **WHEN** the owner taps **Change recipient** and enters an invalid proxy
- **THEN** the bot rejects it with an explanatory error and re-prompts

### Requirement: Payback QR message offers Sent and Cancel actions

The system SHALL attach **✓ Sent** and **✖ Cancel** buttons to the payback QR image message when it is delivered, so the owner can confirm or cancel the payback directly from that message.

#### Scenario: Buttons on delivered QR

- **WHEN** a payback is recorded and its QR image is delivered
- **THEN** the image message carries ✓ Sent and ✖ Cancel buttons bound to that payback

### Requirement: Marking a payback sent replaces the QR message

When the owner marks a pending payback as sent from its QR image message, the system SHALL record the transition and replace the image message with a text status line (description, amount, payback reference, `✅ Sent` and the time), removing the QR. Marking sent from the payment detail view SHALL update that view in place.

#### Scenario: Sent from the QR message

- **WHEN** the owner taps ✓ Sent on a pending payback's QR image message
- **THEN** the payback becomes `sent` with a timestamp, a text message shows the payback status as sent, and the QR image message is deleted

#### Scenario: Duplicate tap

- **WHEN** the owner taps ✓ Sent on a payback that is already `sent`
- **THEN** the system answers that it is already marked as sent and changes nothing

### Requirement: Pending payback can be cancelled

The system SHALL let the owner cancel a `pending` payback. Cancelling SHALL set its status to `cancelled`, replace its QR image message with a text status line showing `❌ Cancelled` (QR removed), and release its amount from the payment's payback allowance. A `sent` or already `cancelled` payback SHALL NOT be cancellable, and concurrent Sent/Cancel taps SHALL resolve to exactly one outcome.

#### Scenario: Cancel a pending payback

- **WHEN** the owner taps ✖ Cancel on a pending payback's QR image message
- **THEN** the payback becomes `cancelled`, the QR image message is replaced by a text message showing it as cancelled, and the payment's remaining payable amount increases by the payback amount

#### Scenario: Cancel a sent payback

- **WHEN** the owner attempts to cancel a payback that is already `sent`
- **THEN** the system refuses, states it was already sent, and changes nothing

#### Scenario: Sent after cancel

- **WHEN** the owner taps ✓ Sent on a payback that is `cancelled`
- **THEN** the system answers that it was cancelled and changes nothing

#### Scenario: Cancel from payment detail

- **WHEN** the owner taps Cancel next to a pending payback in the payment detail view
- **THEN** the payback becomes `cancelled` and the detail view re-renders with it marked cancelled and excluded from totals
