# Spec Delta

## Purpose
Lets administrators of a Telegram chat act on every payment of that chat's events from the bot, not only on payments they created, and records which user performed each action so changes can be traced.

## ADDED Requirements

### Requirement: Chat admins can act on any payment of their chat's events

The system SHALL let an administrator or the owner of an event's Telegram chat perform in the bot every action available to a payment's owning user (view it, mark it received, void it, pay it back, mark a payback sent or cancel it) on any payment of that event, in addition to the owning user. Administrator status SHALL be checked at the time of each action.

#### Scenario: Admin pays back another user's payment

- **WHEN** a chat administrator who did not create a received payment runs `/payback <ref>` or taps its Payback button
- **THEN** the payback flow starts as it would for the owner

#### Scenario: Admin taps the buttons on a shared QR message

- **WHEN** a chat administrator taps ✓ Received, ✖ Void, ✓ Sent or ✖ Cancel on a payment or payback QR message created by another user
- **THEN** the action is applied exactly as if the owner had tapped it

### Requirement: Other users stay refused and uncertainty denies access

The system SHALL refuse a user who is neither a payment's owner nor an administrator of its event's chat with the existing "not your payment" message, SHALL keep a payment that belongs to no event limited to its owner, and SHALL deny access when administrator status cannot be determined.

#### Scenario: Ordinary member

- **WHEN** a chat member who is neither the owner nor an administrator taps an action on another user's payment
- **THEN** the bot refuses with the existing "not your payment" message and nothing changes

#### Scenario: Administrator status cannot be checked

- **WHEN** the check of the user's administrator status fails
- **THEN** the action is refused and nothing changes

#### Scenario: Payment without an event

- **WHEN** a user who is not the owner acts on a legacy payment that belongs to no event
- **THEN** the action is refused

### Requirement: Admins see all payments of an event in /payments

The system SHALL show a chat administrator every payment of the event, from every user, when they drill into an event in `/payments`, with the same per-payment buttons and net amounts as the owner sees; other users SHALL continue to see only their own payments.

#### Scenario: Admin drills into an event

- **WHEN** a chat administrator opens an event in `/payments` and the event has payments from several users
- **THEN** all of them are listed, each with the buttons that fit its status

#### Scenario: Ordinary member drills into an event

- **WHEN** a non-administrator opens the same event
- **THEN** only their own payments are listed

### Requirement: Actions record who performed them

The system SHALL record the Telegram user id of the person who performs each of these actions, in the same step that applies it: who marked a payment received, who voided it, who created a payback, who marked it sent, and who cancelled it. This SHALL apply to actions taken in the bot and on the web admin page, by owners and administrators alike. Records that predate this behaviour SHALL have no recorded actor.

#### Scenario: Owner marks received

- **WHEN** the owner marks a pending payment received
- **THEN** the payment records the owner as the user who marked it received

#### Scenario: Admin voids another user's payment

- **WHEN** a chat administrator voids another user's pending payment
- **THEN** the payment records that administrator, not the owner, as the user who voided it

#### Scenario: Web admin creates and sends a payback

- **WHEN** an admin creates a payback on the web page and later marks it sent
- **THEN** the payback records that admin as creator and as the user who marked it sent

#### Scenario: Losing a race records nothing

- **WHEN** two users tap Sent and Cancel on the same pending payback and only one transition applies
- **THEN** only the winning user is recorded for the transition that took place

#### Scenario: Earlier records

- **WHEN** a payment or payback was created before this behaviour existed
- **THEN** its actor fields are empty
