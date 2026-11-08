# Spec Delta

## ADDED Requirements

### Requirement: /start offers the event's default amount

The system SHALL, when the chosen event has a default amount, show it on the `/start` amount prompt as a one-tap "Use SGD x.xx" button, and tapping it SHALL have the same effect as typing that amount (the flow moves to the confirmation summary). The user SHALL still be able to type a different amount. An event without a default amount SHALL show the prompt as before.

#### Scenario: Use the default

- **WHEN** an event has a default amount of 21.00 and the user reaches the amount step of `/start` and taps "Use SGD 21.00"
- **THEN** the confirmation summary shows SGD 21.00 and the payment is created only after the user confirms

#### Scenario: Type a different amount

- **WHEN** the same user types `15` instead
- **THEN** the summary shows SGD 15.00

#### Scenario: Event without a default amount

- **WHEN** an event has no default amount
- **THEN** the amount prompt has no default button

#### Scenario: Stale button

- **WHEN** the button is tapped after the conversation expired or moved on
- **THEN** the bot says the session expired and creates nothing
