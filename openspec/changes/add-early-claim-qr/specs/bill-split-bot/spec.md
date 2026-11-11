## ADDED Requirements

### Requirement: A member can get their own QR before the claiming is closed

The system SHALL show a Get my QR button on the claim message. When a member who holds at least one item taps it, the system SHALL send them a PayNow QR for their own amount to the payee already given, without waiting for the organiser's Done. The amount SHALL be the member's items (each item split equally between its holders) plus their proportional share of the difference between the receipt total and the items, calculated from the receipt's total of all items so that it does not depend on what other members claim. The QR SHALL be sent by direct message; when the bot cannot message the member, the tap SHALL open the bot with a start link so the member collects it with the existing Get my QR flow. A member who holds nothing SHALL be told to claim an item first, and the organiser SHALL be told there is nothing to collect when the organiser is the payee. The QR SHALL carry the merchant name from the receipt as its description when one was read, and no description otherwise.

#### Scenario: Member takes their QR early

- **WHEN** Ann holds item 1 and taps Get my QR while other items are unclaimed
- **THEN** Ann receives a QR for her amount by direct message and claiming stays open

#### Scenario: Bot cannot message the member

- **WHEN** Bob has never started the bot and taps Get my QR
- **THEN** the tap opens the bot with a start link and Bob collects his QR there

#### Scenario: Nothing claimed

- **WHEN** a member who holds no item taps Get my QR
- **THEN** they are told to claim an item first

#### Scenario: Member without a Telegram account

- **WHEN** the organiser typed a name for a person who has no Telegram account
- **THEN** that person has no way to take a QR and is served by the shared chat QR when the claiming is closed

#### Scenario: Organiser is the payee

- **WHEN** the organiser, who is the payee, taps Get my QR
- **THEN** they are told their own share is not collected

### Requirement: Taking the QR locks the member's items and fixes their amount

The system SHALL, when a member takes their QR, lock the items they hold so that nobody can add or remove holders on them, mark the member as having their QR in the claim message, and fix the member's amount at the one on the QR. A member who has taken their QR SHALL NOT be able to take a second one. When the claiming is closed the locked amounts SHALL be used as sent, the cents the rounding leaves over SHALL go to the people who have not taken a QR, or to the organiser when everyone has, and a member who already received their QR SHALL NOT be sent another. Unclaimed items SHALL NOT be shared with a member whose amount is fixed.

#### Scenario: Items locked

- **WHEN** Ann has taken her QR for item 1
- **THEN** item 1 is marked as locked and a tap on it by anyone changes nothing

#### Scenario: Same amount at the end

- **WHEN** the claiming is closed after Ann took her QR
- **THEN** Ann's amount in the summary equals the amount on her QR and she is not sent a second QR

#### Scenario: Item shared N ways

- **WHEN** Ann holds one share of a 30.00 item shared 3 ways and takes her QR
- **THEN** her QR includes 10.00 for that item and later claims on the other shares do not change it

#### Scenario: Shared item

- **WHEN** Ann and Bob both hold item 2 and Ann takes her QR
- **THEN** item 2 is locked with both of them on it and each pays their half

#### Scenario: Unclaimed items and fixed members

- **WHEN** items are unclaimed and everyone who claimed has taken their QR
- **THEN** the organiser is not offered to share them evenly with those members and can only cover them

#### Scenario: Totals still add up

- **WHEN** some members took their QR early and the claiming is closed
- **THEN** all amounts, including the organiser's, add up to the receipt total

## MODIFIED Requirements

### Requirement: Any member can claim and un-claim items

The system SHALL show in the claim message each numbered item with its price and the names of the people who have claimed it, with one button per item. Any member of the group SHALL be able to tap an item to claim it for themselves and tap it again to un-claim it, and the message SHALL update after each tap. An item claimed by several people SHALL be shared equally between them. A member SHALL NOT be able to claim for, or un-claim for, anyone else, and nobody, the organiser included, SHALL be able to change an item that is locked because a holder has taken their QR.

#### Scenario: Claiming an item

- **WHEN** a member taps item 2
- **THEN** the claim message shows that member's name against item 2

#### Scenario: Un-claiming

- **WHEN** the same member taps item 2 again
- **THEN** their name is removed from item 2

#### Scenario: Sharing an item

- **WHEN** two members tap item 3
- **THEN** both names are shown against item 3 and it will be split equally between them

#### Scenario: Same tap time

- **WHEN** several members tap different items at nearly the same moment
- **THEN** every tap is recorded

#### Scenario: Locked item

- **WHEN** a member taps an item that a holder has locked by taking their QR
- **THEN** nothing changes and they are told the item is locked

#### Scenario: Organiser's menu on a locked item

- **WHEN** the organiser tries to add someone to, remove someone from or clear a locked item, or change its number of ways
- **THEN** nothing changes and the organiser is told the item is locked
