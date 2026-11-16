## ADDED Requirements

### Requirement: The payment page asks the details the event chose

The system SHALL show on an event's payment page the details the event asks for, each required: a full name (1 to 80 characters), a valid email address (up to 120) and each custom field (1 to 100). It SHALL refuse a request with one empty or invalid, naming the field, and store the answers with the payment, each custom answer with its label. With no details asked, the page SHALL be unchanged.

#### Scenario: Required details given

- **WHEN** a payer fills in every field the event asks for and submits
- **THEN** the QR is created and the details are stored with the payment

#### Scenario: A field is missing

- **WHEN** a payer submits without an email on an event that asks for one
- **THEN** no payment is created and the page names the email field

#### Scenario: Invalid email

- **WHEN** a payer enters text that is not an email address
- **THEN** the request is refused as an invalid email

#### Scenario: Event asks nothing extra

- **WHEN** an event has no details switched on
- **THEN** the page shows only its existing fields and an empty name is accepted as before

### Requirement: Registrant details stay private

The system SHALL NOT include a payer's email or custom answers in payment lists, payment views, QR captions or images, chat messages, the payer's own history or any bot message. Only the admin CSV export SHALL return them. The page SHALL tell the payer that the organiser will see the details they give.

#### Scenario: Details are not in the list

- **WHEN** an admin opens the event page's payment list for a payment that has an email and answers
- **THEN** the list shows neither the email nor the answers

#### Scenario: Payer is told who sees it

- **WHEN** the payment page asks for any detail
- **THEN** it states that the organiser will see the details
