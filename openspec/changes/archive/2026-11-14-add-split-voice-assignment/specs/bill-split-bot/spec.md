## ADDED Requirements

### Requirement: A voice note can answer who had which item

While the bot waits for the assignment of a scanned receipt's items, a voice note from the organiser SHALL be read as spoken assignments, turned into the same lines a typed assignment uses, and offered back for confirmation. The bot SHALL show what it heard and, in a separate message, the resulting lines with a **Use these lines** button, and SHALL NOT change the split until that button is tapped.

#### Scenario: Spoken assignment

- **WHEN** the receipt has items 1 Pizza, 2 Beer, 3 Salad and the organiser sends a voice note saying "the pizza and the salad were Ann's, the beer was shared by Ann and Bob"
- **THEN** the bot replies with what it heard and the lines `1,3 Ann` and `2 Ann, Bob (shared)` in their own message with a **Use these lines** button, and the assignment is still waiting

#### Scenario: Confirming

- **WHEN** the organiser taps **Use these lines**
- **THEN** the lines are checked and applied exactly as if the organiser had typed them, and the flow continues as after a typed assignment

#### Scenario: Correcting

- **WHEN** the organiser sends another voice note, or types an assignment, instead of tapping the button
- **THEN** the earlier lines are discarded and the new message is handled, and the old button no longer applies anything

#### Scenario: Lines that fail the usual check

- **WHEN** the lines made from a voice note name an item number that does not exist, or the button is tapped after the items changed so that the lines no longer fit
- **THEN** the bot gives the same error a typed message would, applies nothing and keeps asking for the assignment

### Requirement: Voice notes are limited and never kept

The system SHALL refuse a voice note longer than 60 seconds or larger than 1 MB with a message that says so, SHALL hold the audio in memory only for the one request, and SHALL NOT store or log the audio or the heard text. The made lines SHALL live only in the conversation state until used, replaced or the conversation ends.

#### Scenario: Too long

- **WHEN** the organiser sends a voice note of 90 seconds at the assignment step
- **THEN** the bot says voice notes can be at most 60 seconds, applies nothing, and keeps asking for the assignment

#### Scenario: Nothing is kept

- **WHEN** a voice note was heard and the assignment is finished or cancelled
- **THEN** neither the audio nor the heard text remains stored anywhere

### Requirement: A voice note that cannot be used leaves the organiser where they were

When the speech cannot be turned into text, the text cannot be turned into assignment lines, or speech-to-text fails, the bot SHALL say so, show what it heard when there is any, and invite the organiser to send another voice note or type the assignment. The conversation state SHALL stay at the assignment step.

#### Scenario: Nothing heard

- **WHEN** the voice note is silent or the speech-to-text returns no words
- **THEN** the bot says it heard nothing and asks for another voice note or typed text

#### Scenario: Heard but not understood

- **WHEN** the speech is heard but cannot be made into lines
- **THEN** the bot shows what it heard, says it could not turn that into an assignment, and asks for another voice note or typed text

#### Scenario: Speech-to-text is down

- **WHEN** the speech-to-text call fails
- **THEN** the bot says voice is not working right now and asks for typed text

### Requirement: Voice notes are only used for the organiser's assignment

A voice note SHALL be acted on only when the sender owns the split and the conversation is at the assignment step. At every other step, or from anyone else, the bot SHALL NOT change the split; in a private chat it SHALL reply with a short line saying that a voice note is accepted only for the assignment, and in a group it SHALL stay silent. At the assignment step, when speech-to-text is not configured, the bot SHALL say voice is not available and keep asking for typed text.

#### Scenario: Another member in a group

- **WHEN** a member who is not the organiser sends a voice note in the group
- **THEN** the bot does nothing

#### Scenario: Wrong step

- **WHEN** the organiser sends a voice note while the bot waits for the payee or the total
- **THEN** the split does not change, and in a private chat the bot says it takes a typed answer here

#### Scenario: Not configured

- **WHEN** the speech-to-text binding is missing and the organiser sends a voice note at the assignment step
- **THEN** the bot says voice is not available and asks for typed text

### Requirement: The assignment prompt mentions voice

The assignment prompt SHALL say that a voice note works as well as typing, when speech-to-text is configured.

#### Scenario: Prompt

- **WHEN** the bot asks who had which item and speech-to-text is configured
- **THEN** the prompt includes a line that the organiser can also send a voice note
