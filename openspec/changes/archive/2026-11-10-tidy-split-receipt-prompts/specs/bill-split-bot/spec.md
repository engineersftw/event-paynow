## ADDED Requirements

### Requirement: The receipt review is removed once the scan is used

The system SHALL delete the "I read this receipt" message when the user taps **Use this**. The other review buttons SHALL keep their behaviour, so the review stays visible when the user scans again, types the total instead, or adds a missing item.

#### Scenario: Scan used

- **WHEN** the user taps Use this on the review
- **THEN** the review message is deleted and the bot asks who had what

#### Scenario: Scan again

- **WHEN** the user taps Scan again on the review
- **THEN** the review message stays, without its buttons, and the bot asks for another photo

#### Scenario: Message cannot be deleted

- **WHEN** Telegram refuses to delete the review message
- **THEN** its buttons are removed instead and the flow continues

### Requirement: The assignment prompt does not promise an uncollected share

The system SHALL NOT state in the assignment prompt that the organiser's share is not collected, because the payee is only asked afterwards. The prompt SHALL say that `me` is the organiser, that the share is not collected if the organiser is the payee, and that otherwise a QR for it is sent to the organiser.

#### Scenario: Wording

- **WHEN** the bot asks who had what
- **THEN** the text explains `me` and both outcomes, and does not say the share is simply not collected

### Requirement: The summary counts the organiser among the people sharing the bill

The system SHALL, in the custom and receipt summary, count the organiser in "shared by N people" when the summary shows an amount for the organiser: their own share, or a leftover they cover or pay. When the leftover is split evenly between the listed people, or there is no leftover, the count is the number of listed people.

#### Scenario: Organiser has an own share

- **WHEN** a receipt split lists two people and the organiser's own share is SGD 32.13
- **THEN** the summary says the bill is shared by 3 people

#### Scenario: Organiser covers a leftover

- **WHEN** a custom split lists two people and leaves a leftover out for the organiser to cover
- **THEN** the summary says the bill is shared by 3 people

#### Scenario: Exact list

- **WHEN** a custom split lists two people whose amounts add up to the bill
- **THEN** the summary says the bill is shared by 2 people

#### Scenario: Leftover split evenly

- **WHEN** the leftover is split evenly between two listed people
- **THEN** the summary says the bill is shared by 2 people

## MODIFIED Requirements

### Requirement: The bot asks whether the payee is the organiser

The system SHALL, after the payee is entered in any split (equal, custom or receipt), ask whether the payee is the organiser, with the buttons "Yes, it's me" and "No, someone else", before the description question. The answer SHALL be kept with the split and SHALL be asked again whenever the payee is changed by amending or editing. Once the question is answered the system SHALL remove its buttons and replace its text with the answer: "Payment was made by you." or "Payment was made by someone else."

#### Scenario: Question after the payee

- **WHEN** the user enters a valid payee
- **THEN** the bot asks whether the payee is the user, with Yes and No buttons

#### Scenario: Answer shown

- **WHEN** the user taps Yes, it's me
- **THEN** the buttons disappear and the message reads "Payment was made by you."

#### Scenario: Answer shown for someone else

- **WHEN** the user taps No, someone else
- **THEN** the buttons disappear and the message reads "Payment was made by someone else."

#### Scenario: Payee changed

- **WHEN** the user amends or edits the payee
- **THEN** the bot asks again whether the new payee is the user, in a new message

#### Scenario: Only the organiser answers in a group

- **WHEN** a different group member taps a button of that question
- **THEN** nothing changes and they are told the split is not theirs
