## ADDED Requirements

### Requirement: The summary can be amended

The system SHALL show an Amend button on the summary, next to Confirm and Cancel. Tapping it SHALL offer Total, Split, Payee, Description and Back. Choosing a field SHALL ask only that question, with a Keep as is button, and then show the updated summary. Choosing Split SHALL ask again for equal or custom and the details that go with the choice. Back SHALL return to the summary unchanged. Amending SHALL NOT generate any QR.

#### Scenario: Change the total

- **WHEN** the user taps Amend, then Total, and sends a new valid total
- **THEN** the bot shows an updated summary with the new total and the other answers unchanged

#### Scenario: Keep as is

- **WHEN** the user taps Amend, chooses Payee and taps Keep as is
- **THEN** the bot shows the summary again with the payee unchanged

#### Scenario: Change the split type

- **WHEN** the user amends Split and chooses Custom amounts instead of Equally and sends a valid list
- **THEN** the summary shows the custom amounts and no longer shows the equal share

#### Scenario: Back

- **WHEN** the user taps Amend and then Back
- **THEN** the summary is shown again with its three buttons

### Requirement: An amendment that breaks another answer asks for that answer again

The system SHALL, after any change, check every answer against the others and ask only for what is now missing or invalid, before showing the summary. A custom list that adds up to more than the new total SHALL be asked for again. A custom list that now falls short of the total SHALL ask what to do with the leftover if no choice was made. A number of people larger than the cents in the new total SHALL be asked for again.

#### Scenario: Total drops below the list

- **WHEN** a custom list adds up to 100.00 and the user amends the total to 80.00
- **THEN** the bot says the list is SGD 20.00 over the new total and asks for the list again

#### Scenario: Total leaves a gap

- **WHEN** a custom list adds up to 100.00 with no leftover choice and the user amends the total to 120.00
- **THEN** the bot asks what to do with the SGD 20.00 leftover

#### Scenario: Leftover choice already made

- **WHEN** a custom list with the leftover split evenly has its total raised
- **THEN** the earlier choice is kept and the summary shows the new even amounts

### Requirement: Editing a sent answer amends it

The system SHALL, when the owner edits the text of a message that answered the total, the number of people, the custom list, the payee or the description, read the new text and apply the same checks as for a new answer. When the split is waiting at the summary it SHALL show an updated summary; otherwise it SHALL ask for what is now needed. An invalid edit SHALL be refused with the reason and the earlier value kept.

#### Scenario: Edit the total at the summary

- **WHEN** the summary is shown and the user edits their total message from `100` to `120`
- **THEN** the bot shows a new summary based on 120.00

#### Scenario: Edit an earlier answer while a later question is open

- **WHEN** the bot is asking for the payee and the user edits their total message to a valid new total
- **THEN** the bot confirms the update and keeps waiting for the payee, without repeating the question

#### Scenario: Invalid edit

- **WHEN** the user edits their total message to `abc`
- **THEN** the bot says the edit is not a valid amount and keeps the earlier total

### Requirement: Edits that do not apply are ignored

The system SHALL ignore, without a reply, edits of messages that are not recorded answers of the active split, edits from anyone but the owner in a group, and edits after the QR was sent or the split ended. An edited payee message in a group SHALL be removed like the original.

#### Scenario: Edit after the QR was sent

- **WHEN** the user edits an answer after confirming
- **THEN** nothing happens

#### Scenario: Another member edits

- **WHEN** a different group member edits a message of theirs
- **THEN** the bot ignores it

#### Scenario: Edited payee in a group

- **WHEN** the owner edits their payee message in a group where the bot may delete messages
- **THEN** the bot deletes the edited message and uses the new payee

### Requirement: Only one summary can be confirmed

The system SHALL, whenever a new summary replaces an earlier one, remove the buttons from the earlier summary, so that only the latest summary can be confirmed. A tap on a button of an earlier summary SHALL be answered with a short notice and change nothing.

#### Scenario: Old summary is replaced

- **WHEN** the user amends the total and a new summary is shown
- **THEN** the first summary no longer has buttons

#### Scenario: Tap on a stale button

- **WHEN** the user taps Confirm on a summary that has been replaced
- **THEN** no QR is sent and the user is told that step is over

## MODIFIED Requirements

### Requirement: The bot confirms before it generates the QR

The system SHALL, after the last question, show one summary with Confirm, Amend and Cancel buttons, and SHALL NOT generate any QR until the user confirms. For a custom split the summary SHALL list each person with the amount they owe, say how a leftover was handled, and show any amount collected above the bill because of rounding. In a private chat the summary shows the payee type and number. In a group chat the summary SHALL show only the payee type and the last four characters of the payee, never the full number.

#### Scenario: Summary in a private chat

- **WHEN** the user has answered every question in a private chat
- **THEN** the bot shows the payee, total, number of people, share and description, and no QR has been sent yet

#### Scenario: Summary in a group

- **WHEN** the user has answered every question in a group chat
- **THEN** the summary hides all but the last four characters of the payee

#### Scenario: Custom summary

- **WHEN** the user has answered every question of a custom split with a leftover left out
- **THEN** the summary lists each person's amount, says the leftover is left out and who covers it, and no QR has been sent yet

#### Scenario: Confirm

- **WHEN** the user taps Confirm
- **THEN** the buttons are removed from the summary and the QR is sent exactly once, even if the button is tapped twice

#### Scenario: Cancel

- **WHEN** the user taps Cancel
- **THEN** nothing is generated, the conversation is cleared and the user is told to send `/split` to begin again

#### Scenario: Amend button present

- **WHEN** the summary is shown
- **THEN** it has Confirm, Amend and Cancel buttons
