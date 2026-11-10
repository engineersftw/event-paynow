

### Requirement: The organiser's chat is not answered while the bot waits for taps in a group

The system SHALL, in a group chat, ignore the organiser's free text without any reply while the split is at a step that only takes button taps, and the split SHALL continue unchanged. In a private chat the bot SHALL keep telling the user to tap one of the buttons. Steps that take typed text and commands SHALL be unchanged.

#### Scenario: Organiser talks to the group while members claim

- **WHEN** the organiser sends "@Ann please tap item 3" in a group while the claim message is open
- **THEN** the bot sends no reply and the claims are unchanged

#### Scenario: Other button-only steps in a group

- **WHEN** the organiser sends any text in a group while the bot waits for a button on the review, the summary or a choice
- **THEN** the bot sends no reply

#### Scenario: Private chat keeps the hint

- **WHEN** the user sends text in a private chat while the bot waits for a button
- **THEN** the bot replies that they should tap one of the buttons or send /cancel

#### Scenario: Typed answers still work

- **WHEN** the organiser sends the payee in a group while the bot is asking for it
- **THEN** the answer is read as before
