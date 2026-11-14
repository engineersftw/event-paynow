## MODIFIED Requirements

### Requirement: The page explains the bot, how to start and what it stores

The page SHALL describe what the bot does: an equal split with one QR for one share, custom amounts per person, with the QRs posted in the chat, a receipt photo read for items, GST and service charge, and, in a group, members claiming their own items and paying at once. It SHALL list how to start (`/split`, `/split_custom`, `/split_receipt`, and adding the bot to a group or messaging it), show the order of a split (the payee first, then the bill, the description, the details and a summary to confirm), and say what the bot keeps: nothing beyond the conversation, receipt photos are never stored, and a mentioned person's username and a waiting QR are kept briefly and can be deleted with `/forget`.

#### Scenario: What it does

- **WHEN** the page is shown
- **THEN** it explains the equal split, custom amounts with mentions, the receipt scan and group claiming

#### Scenario: Getting started

- **WHEN** the page is shown
- **THEN** it lists `/split`, `/split_custom` and `/split_receipt` and how to add the bot to a group

#### Scenario: Privacy

- **WHEN** the page is shown
- **THEN** it says receipt photos are not stored and that `/forget` deletes what the bot remembers about a person
