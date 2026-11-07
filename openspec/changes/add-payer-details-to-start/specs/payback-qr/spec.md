## ADDED Requirements

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
