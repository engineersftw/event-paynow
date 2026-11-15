## ADDED Requirements

### Requirement: The organiser chooses how to share out the items

The system SHALL, after the user taps Use this on a receipt scan, ask "How do you want to share out the items?" with buttons for each way that is available: "I'll type who had what", "Say it with a voice note" when speech-to-text is configured, and, in a group chat only, "Let everyone claim their items". In a private chat without speech-to-text the question SHALL NOT be asked and the bot asks for the typed assignment as before. Choosing to type SHALL continue as before, choosing to claim SHALL post the claim message, and choosing voice SHALL ask for a voice note.

#### Scenario: Group with voice

- **WHEN** the organiser taps Use this on a scan in a group chat and voice is available
- **THEN** the bot offers "I'll type who had what", "Say it with a voice note" and "Let everyone claim their items"

#### Scenario: Private chat with voice

- **WHEN** the organiser taps Use this on a scan in a private chat and voice is available
- **THEN** the bot offers "I'll type who had what" and "Say it with a voice note" and no claiming option

#### Scenario: Group without voice

- **WHEN** the organiser taps Use this on a scan in a group chat and voice is not available
- **THEN** the bot offers only "I'll type who had what" and "Let everyone claim their items", as before

#### Scenario: Private chat without voice

- **WHEN** the organiser taps Use this on a scan in a private chat and voice is not available
- **THEN** the bot asks who had each item without a menu, as before

### Requirement: Choosing voice asks for a voice note

The system SHALL, when the organiser chooses "Say it with a voice note", send the numbered item list as its own message and then a prompt that says how to speak it (who had which item, with an example) and that the bot will show what it heard and the lines before using them. The prompt SHALL carry a "Type instead" button. In a group the prompt SHALL be one the organiser replies to, so that a voice note reaches the bot with privacy mode on. The voice note, and typed text, SHALL then be read as in the existing assignment step.

#### Scenario: Prompt

- **WHEN** the organiser taps "Say it with a voice note"
- **THEN** the bot sends the item list, then a prompt that explains what to say and offers "Type instead"

#### Scenario: Type instead

- **WHEN** the organiser taps "Type instead" on that prompt
- **THEN** the bot shows the typed assignment prompt and the voice choice is dropped

#### Scenario: Typed text still works

- **WHEN** the organiser types the assignment after choosing voice
- **THEN** it is read as a typed assignment

### Requirement: A voice note at the menu counts as choosing voice

The system SHALL, when the organiser sends a voice note while the menu is shown and voice is available, treat it as having tapped "Say it with a voice note" and read it as the spoken assignment, without asking again.

#### Scenario: Voice note first

- **WHEN** the menu is shown and the organiser sends a voice note saying who had which item
- **THEN** the bot shows what it heard and the lines with a **Use these lines** button

## MODIFIED Requirements

### Requirement: Amending the items reopens the choice

The system SHALL, when the organiser chooses Items from Amend on a receipt split, ask again how to share out the items, with the same menu as the first time (type, voice note when available, let everyone claim in a group), keeping the earlier claims when claiming is reopened.

#### Scenario: Reopen the menu

- **WHEN** the organiser amends Items on a receipt split in a private chat and voice is available
- **THEN** the bot offers "I'll type who had what" and "Say it with a voice note" again

#### Scenario: Reopen claiming

- **WHEN** the organiser amends Items and chooses Let everyone claim
- **THEN** a new claim message shows the earlier claims and members can change them

### Requirement: Voice notes are only used for the organiser's assignment

A voice note SHALL be acted on only when the sender owns the split and the conversation is at the assignment step, or at the menu that asks how to share out the items (where it counts as choosing the voice option). At every other step, or from anyone else, the bot SHALL NOT change the split; in a private chat it SHALL reply with a short line saying that a voice note is accepted only for the assignment, and in a group it SHALL stay silent. At the assignment step, when speech-to-text is not configured, the bot SHALL say voice is not available and keep asking for typed text.

#### Scenario: Another member in a group

- **WHEN** a member who is not the organiser sends a voice note in the group
- **THEN** the bot does nothing

#### Scenario: Wrong step

- **WHEN** the organiser sends a voice note while the bot waits for the payee or the total
- **THEN** the split does not change, and in a private chat the bot says it takes a typed answer here

#### Scenario: At the menu

- **WHEN** the organiser sends a voice note while the bot shows the how-to-share-out menu
- **THEN** it is read as the spoken assignment, exactly as if the organiser had tapped "Say it with a voice note" first

#### Scenario: Not configured

- **WHEN** the speech-to-text binding is missing and the organiser sends a voice note at the assignment step
- **THEN** the bot says voice is not available and asks for typed text

## REMOVED Requirements

### Requirement: In a group the organiser can let members claim the items
**Reason**: Replaced by the menu that offers every way to share out the items, in a private chat as well as a group.
**Migration**: See "The organiser chooses how to share out the items".
