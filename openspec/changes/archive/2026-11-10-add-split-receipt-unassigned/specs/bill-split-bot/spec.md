## ADDED Requirements

### Requirement: The organiser chooses what happens to unassigned items

The system SHALL, when an assignment leaves some receipt items out, state which items are unassigned and what they cost before charges, and ask the organiser to choose Split evenly or Leave them out. Split evenly SHALL share each unassigned item equally between everyone named in the assignment. Leave them out SHALL assign each unassigned item to the organiser, so it is counted but not collected. The system SHALL NOT choose for the organiser, and SHALL NOT ask when every item is assigned.

#### Scenario: Split evenly

- **WHEN** item 3 (9.00) is unassigned and the message names Ann and Bob, and the organiser chooses Split evenly
- **THEN** Ann and Bob each carry 4.50 of item 3, plus their share of the charges

#### Scenario: Leave them out

- **WHEN** item 3 is unassigned and the organiser chooses Leave them out
- **THEN** item 3 counts as the organiser's, the summary shows the organiser's share, and only the people named are asked to pay

#### Scenario: Everything assigned

- **WHEN** every item appears in the assignment
- **THEN** the bot does not ask about unassigned items

#### Scenario: The question names the items

- **WHEN** items 2 and 5 are unassigned
- **THEN** the question lists items 2 and 5 and their combined price

### Requirement: The unassigned choice is kept while the same items stay unassigned

The system SHALL keep the organiser's choice when an assignment is edited or amended and the same items are still unassigned, and SHALL ask again when a different set of items is unassigned. It SHALL clear the choice when no item is unassigned any more.

#### Scenario: Edit with the same gap

- **WHEN** the organiser edits the assignment message but item 3 is still unassigned
- **THEN** the earlier choice is applied and the summary updates

#### Scenario: A different gap

- **WHEN** an amended assignment leaves item 4 unassigned instead of item 3
- **THEN** the bot asks again what to do with it

## MODIFIED Requirements

### Requirement: Items are assigned to people in one message

The system SHALL ask who had each item and accept one message with lines of item numbers followed by people, for example `1,3 Ann`, `2 Ann, Bob`, `4 me`, `5 all`. A person can be a name or an @mention. `me` is the organiser and `all` is everyone named in the message. An item given to several people is shared equally between them. An item SHALL NOT be assigned more than once, the item numbers SHALL exist, and every line SHALL name people; a bad line SHALL be named with the whole message asked for again. Items that appear in no line are unassigned and are handled by the organiser's choice.

#### Scenario: Valid assignment

- **WHEN** the receipt has 5 items and the user sends `1,3 Ann`, `2 Ann, Bob`, `4 me` and `5 all`
- **THEN** the bot accepts the assignment

#### Scenario: Unassigned item

- **WHEN** item 4 appears in no line
- **THEN** the bot accepts the message and asks what to do with item 4

#### Scenario: Item assigned twice

- **WHEN** item 2 appears in two lines
- **THEN** the bot rejects the message and names item 2

#### Scenario: Unknown item number

- **WHEN** a line names item 9 on a receipt with 5 items
- **THEN** the bot rejects the message and names item 9

#### Scenario: Only the organiser named

- **WHEN** the message names only `me`
- **THEN** the bot says nobody else owes anything and asks for the message again
