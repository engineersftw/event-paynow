# Spec Delta

## Purpose

Defines the lifecycle of an **event**: a chat-scoped container (chat_id + topic_id) for a single PayNow payee and its payments. One chat can hold many events; each is `open` (accepts new payments) or `closed` (read-only history).

## ADDED Requirements

### Requirement: Create an event via /init

The bot SHALL create an `events` row when the user completes `/init`. The flow collects an event name (non-empty text, trimmed, ≤ 50 chars) and a PayNow proxy (mobile or UEN, validated as in existing proxy validation), echoes both for confirmation, and on confirm persists the row with `status = 'open'`, a unique base32 `ref`, `created_at`, and a null `closed_at`. The event `ref` is shown to the user after creation.

#### Scenario: Happy path — mobile proxy

- **WHEN** user sends `/init`, enters event name "AZURA's Birthday", then proxy "91234567", then confirms
- **THEN** bot replies with the new event ref, stores `{ name: "AZURA's Birthday", payee_type: "mobile", payee_value: "+6591234567", status: "open" }` in the `events` table, and exits the init flow

#### Scenario: Proxy validation failure

- **WHEN** user sends `/init`, enters name, then an invalid proxy (e.g. "12345"), then re-enters a valid proxy
- **THEN** bot re-prompts for the proxy (no event row created) and only proceeds to confirm on valid input

#### Scenario: Cancel mid-init

- **WHEN** user sends `/init`, enters name and proxy, then types `cancel` at the confirmation step
- **THEN** bot does NOT create an `events` row, exits the init flow, and shows the idle help message

#### Scenario: Duplicate event name in the same chat

- **WHEN** chat already has an open event named "AZURA's Birthday" and the user runs `/init` with the same name
- **THEN** bot warns that the name is in use and offers to either pick a different name or proceed anyway (still creates a new event with a different `ref`)

### Requirement: List open events

The bot SHALL expose the set of open events for a given chat. This is used by `/start` and `/end_event` to let the user pick a target event.

#### Scenario: One open event

- **WHEN** `/start` is invoked in a chat with exactly one open event
- **THEN** bot proceeds directly to the amount prompt for that event (no pick step)

#### Scenario: Multiple open events

- **WHEN** `/start` is invoked in a chat with three open events
- **THEN** bot shows an inline-button list: one button per event (label: event name + payee preview), and routes each button tap to the amount prompt for the selected event

#### Scenario: No open events

- **WHEN** `/start` is invoked in a chat with no open events (all closed or none created)
- **THEN** bot replies "No open events. Run /init to create one." and exits

### Requirement: Close an event via /end_event

The bot SHALL provide an `/end_event` command that flips an event from `open` to `closed`. The flow lists open events, the user picks one, the bot asks for confirmation, and on confirm sets `status = 'closed'` and `closed_at` to the current timestamp.

#### Scenario: Close the only open event

- **WHEN** user sends `/end_event`, picks the only open event from the inline list, and confirms
- **THEN** bot marks it closed, replies with a summary ("Event 'X' closed. N payments collected, $M total"), and exits the flow

#### Scenario: Close with pending payments

- **WHEN** user closes an event that has `pending` payments
- **THEN** event still closes; pending payments remain `pending` (the event close does not alter payment status). Subsequent `/start` against this event is rejected

#### Scenario: Double-close (duplicate button tap)

- **WHEN** user taps the close button twice quickly
- **THEN** first tap closes; second tap shows "already closed" (idempotent via compare-and-set on `status = 'open'`)

### Requirement: Reject /start against a closed event

The bot SHALL not allow new payment QRs against a closed event.

#### Scenario: Start targeting closed event

- **WHEN** user runs `/start`, the event-picker UI shows only `open` events, so a closed event cannot be selected
- **THEN** the UI alone is the guard; no backend re-check needed because the list is the only entry point

### Requirement: Event scoped to chat + topic

Each event SHALL belong to the `(chat_id, topic_id)` pair where it was created. `topic_id = 0` (or null) for private chats and supergroups without topics.

#### Scenario: Same chat, different topics

- **WHEN** chat A topic 1 has event "Lunch" and topic 2 has event "Dinner"
- **THEN** `/start` in topic 1 lists only "Lunch"; topic 2 lists only "Dinner"

#### Scenario: Private chat

- **WHEN** user runs `/init` in a DM with the bot (no topic_id)
- **THEN** event row is created with `topic_id = 0` (or NULL); subsequent `/start` in the same DM lists it

### Requirement: /payments lists events, then payments

The `/payments` flow SHALL first list events (open + recently closed), and drilling into an event shows its payments with the existing inline actions (View, Mark as Received, Payback).

#### Scenario: Payments with no events

- **WHEN** `/payments` is invoked in a chat with no events
- **THEN** bot replies "No events yet. Run /init to create one."

#### Scenario: Drill into an event

- **WHEN** user taps an event in the `/payments` list
- **THEN** bot shows the event's payments (each with status + amount + ref + date) and per-payment buttons: "View", "Mark as Received" (if pending), "Payback" (if received)

#### Scenario: Cross-chat isolation

- **WHEN** chat A has event E1 and chat B has event E2
- **THEN** `/payments` in chat A shows only E1; `/payments` in chat B shows only E2
