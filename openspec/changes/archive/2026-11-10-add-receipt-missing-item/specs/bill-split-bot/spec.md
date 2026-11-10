## ADDED Requirements

### Requirement: The review says how much looks missing

The system SHALL, when the items it read add up to less than the amount they should (the printed subtotal, or when none was read, the total minus the service charge and GST plus any discount), say in the review how much looks missing, and SHALL offer an Add a missing item button. It SHALL NOT offer the button when the items add up, when the expected amount cannot be worked out, or when the items add up to more than expected.

#### Scenario: Missing amount shown

- **WHEN** the items add up to 107.60 and the printed subtotal is 117.10
- **THEN** the review says SGD 9.50 looks missing and offers Add a missing item

#### Scenario: No subtotal read

- **WHEN** no subtotal was read, the total is 140.40, the service charge 11.71 and GST 11.59, and the items add up to 107.60
- **THEN** the review works out that SGD 9.50 looks missing

#### Scenario: Everything adds up

- **WHEN** the items add up to the subtotal within two cents
- **THEN** the review shows no missing amount and no Add a missing item button

#### Scenario: Too much instead

- **WHEN** the items add up to more than the subtotal
- **THEN** the review shows only the warning that the numbers do not add up

### Requirement: The user can add the items a scan missed

The system SHALL, when the user taps Add a missing item, ask for the missing items one per line as a name and a price, and offer Add as one line and Back. Added items SHALL be placed after the scanned items, keeping the existing numbers, and the review SHALL be shown again with the warnings worked out again.

#### Scenario: Adding a named item

- **WHEN** SGD 9.50 looks missing and the user sends `Sapporo Black 9.50`
- **THEN** the item is added as the next number and the review no longer shows a missing amount

#### Scenario: Adding as one line

- **WHEN** the user taps Add as one line for a missing SGD 9.50
- **THEN** an item "Unread items" of SGD 9.50 is added

#### Scenario: Several items at once

- **WHEN** the user sends two lines with valid names and prices
- **THEN** both are added in the order sent

#### Scenario: Numbers stay stable

- **WHEN** an item is added to a receipt of 9 scanned items
- **THEN** it becomes item 10 and items 1 to 9 keep their numbers

### Requirement: Added items must be valid

The system SHALL refuse an added item without a valid positive price, with a price of more than two decimals, or that would take the list past 40 items, naming the first bad line and adding nothing. Add as one line SHALL add a single item called "Unread items" for exactly the missing amount.

#### Scenario: Invalid line

- **WHEN** a line has no price, a price of zero or a price with more than two decimals
- **THEN** the bot names the line and asks again without adding anything

#### Scenario: Too many items

- **WHEN** the receipt already has 40 items and the user adds one
- **THEN** the bot says the limit is 40 items and adds nothing

#### Scenario: Back

- **WHEN** the user taps Back
- **THEN** the review is shown again unchanged

#### Scenario: Still short

- **WHEN** the added items do not cover the whole missing amount
- **THEN** the review shows what still looks missing and the button stays

## MODIFIED Requirements

### Requirement: The user reviews what was read before it is used

The system SHALL show the items, charges and total it read, with Use this, Send another photo and Type the total instead buttons, and SHALL NOT continue until the user chooses. It SHALL warn when the items add up to more than the total, or when a price or total looks invalid. Using the scan SHALL set the bill total to the receipt total.

#### Scenario: Use this

- **WHEN** the user taps Use this
- **THEN** the bill total is the receipt total and the bot asks who had each item

#### Scenario: Items exceed the total

- **WHEN** the items add up to more than the total on the receipt
- **THEN** the review shows a warning that the numbers do not add up

#### Scenario: Type the total instead

- **WHEN** the user taps Type the total instead
- **THEN** the bot asks for the bill total as in a normal split

#### Scenario: Added items are used

- **WHEN** the user added a missing item and then taps Use this
- **THEN** the added item is part of the items the bot asks who had
