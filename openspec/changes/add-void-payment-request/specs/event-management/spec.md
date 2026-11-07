## MODIFIED Requirements

### Requirement: /payments lists events, then payments

The `/payments` flow SHALL first list events (open + recently closed), and drilling into an event shows its payments with inline actions: View for every payment, Mark as Received for pending payments, Payback for received payments only. Voided payments are listed with a 🚫 marker and View only.

#### Scenario: Payments with no events

- **WHEN** `/payments` is invoked in a chat with no events
- **THEN** bot replies "No events yet. Run /init to create one."

#### Scenario: Drill into an event

- **WHEN** user taps an event in the `/payments` list
- **THEN** bot shows the event's payments (each with status + amount + ref + date) and per-payment buttons: "View", "Mark as Received" (if pending), "Payback" (if received)

#### Scenario: Pending payment has no Payback

- **WHEN** the event list contains a pending payment
- **THEN** its row has View and Mark as Received but no Payback button

#### Scenario: Voided payment in the list

- **WHEN** the event list contains a voided payment
- **THEN** it is shown with a 🚫 Voided marker and only a View button

#### Scenario: Cross-chat isolation

- **WHEN** chat A has event E1 and chat B has event E2
- **THEN** `/payments` in chat A shows only E1; `/payments` in chat B shows only E2
