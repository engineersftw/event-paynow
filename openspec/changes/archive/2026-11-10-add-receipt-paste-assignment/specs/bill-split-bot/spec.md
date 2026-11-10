## MODIFIED Requirements

### Requirement: Items are assigned to people in one message

The system SHALL ask who had each item and accept one message in either of two formats. The line format has lines of item numbers followed by people, for example `1,3 Ann`, `2 Ann, Bob`, `4 me`, `5 all`. The header format has header lines naming people, each followed by item lines copied from the printed list such as `1. Chefs Pizza SGD 18.80`; a header is a name, an @mention, `me`, `all` or a comma-separated group, with an optional trailing colon, and blank lines are ignored. The format SHALL be detected from the message: a message with any line that is neither an item line (a number then a full stop or bracket) nor a line format line is read as the header format. In the header format an item line is matched by its number only, the rest of the line is ignored, and an item line before the first header is an error. `me` is the organiser and `all` is everyone named in the message. An item given to several people is shared equally between them; in the header format an item listed under several headers is shared by those people. In the line format an item SHALL NOT be assigned more than once. The item numbers SHALL exist, and every header or line SHALL name people; a bad line SHALL be named with the whole message asked for again. Items that appear nowhere are unassigned and are handled by the organiser's choice. The numbered item list SHALL be sent as its own message, just before the assignment prompt, so it can be copied whole, and the prompt SHALL show both formats.

#### Scenario: Valid assignment

- **WHEN** the receipt has 5 items and the user sends `1,3 Ann`, `2 Ann, Bob`, `4 me` and `5 all`
- **THEN** the bot accepts the assignment

#### Scenario: Items in their own message

- **WHEN** the bot asks who had what
- **THEN** it first sends a message holding only the numbered items, then the question

#### Scenario: Pasted list with headers

- **WHEN** the receipt has 4 items and the user sends `Sam`, `1. Chefs Pizza SGD 18.80`, a blank line, `@benjamin`, `2. Clam Chowder SGD 8.80`, a blank line, `All:`, `3. Sirloin Steak SGD 30.80` and `4. Spaghetti SGD 20.80`
- **THEN** item 1 is Sam's, item 2 is Benjamin's and items 3 and 4 are shared by Sam and Benjamin

#### Scenario: Item under two headers

- **WHEN** item 2 is listed under both `Ann` and `Bob` in the header format
- **THEN** item 2 is shared equally by Ann and Bob

#### Scenario: Reworded item line

- **WHEN** a pasted item line is `2. Clam chowder` with no price
- **THEN** it is matched to item 2

#### Scenario: Item line before any header

- **WHEN** the first line of a header format message is `1. Chefs Pizza`
- **THEN** the bot rejects the message, names that line and asks for the whole message again

#### Scenario: Unassigned item

- **WHEN** item 4 appears nowhere in the message
- **THEN** the bot accepts the message and asks what to do with item 4

#### Scenario: Item assigned twice

- **WHEN** item 2 appears in two lines of the line format
- **THEN** the bot rejects the message and names item 2

#### Scenario: Unknown item number

- **WHEN** a line or item line names item 9 on a receipt with 5 items
- **THEN** the bot rejects the message and names item 9

#### Scenario: Only the organiser named

- **WHEN** the message names only `me`
- **THEN** the bot says nobody else owes anything and asks for the message again
