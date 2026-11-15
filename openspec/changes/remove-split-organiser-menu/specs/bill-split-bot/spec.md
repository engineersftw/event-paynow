## ADDED Requirements

### Requirement: Any member, the organiser included, can claim and un-claim items

The system SHALL show in the claim message each numbered item with its price and the names of the people who have claimed it, with one button per item. Any member of the group, the organiser included, SHALL be able to tap an item to claim it for themselves and tap it again to un-claim it, and the message SHALL update after each tap.

#### Scenario: Claiming an item

- **WHEN** a member taps item 2
- **THEN** the claim message shows that member's name against item 2

#### Scenario: Un-claiming

- **WHEN** the same member taps item 2 again
- **THEN** their name is removed from item 2

#### Scenario: Same tap time

- **WHEN** several members tap different items at nearly the same moment
- **THEN** every tap is recorded

#### Scenario: The organiser taps an item

- **WHEN** the organiser taps item 4 in the claim message
- **THEN** item 4 is claimed for the organiser, no menu or other message is posted, and a second tap takes the claim back

### Requirement: An item claimed by several people is shared equally, and in the chat nobody claims for another

The system SHALL share an item claimed by several people equally between them. Nobody SHALL be able to claim for, or un-claim for, anyone else in the chat (the organiser does that in the Mini App), and nobody, the organiser included, SHALL be able to change an item that is locked because a holder has taken their QR.

#### Scenario: Sharing an item

- **WHEN** two members tap item 3
- **THEN** both names are shown against item 3 and it will be split equally between them

#### Scenario: Locked item

- **WHEN** a member taps an item that a holder has locked by taking their QR
- **THEN** nothing changes and they are told the item is locked

### Requirement: An item shared in a number of ways gives each holder one share

The system SHALL, when an item is set to be shared 2 to 20 ways (by the organiser in the Mini App), make it that many equal shares, with any odd cents on the first shares; each person who claims it SHALL hold one share and pay one share. A person SHALL NOT hold two shares of the same item, and claims on it SHALL stop when every share is held.

#### Scenario: Shares claimed

- **WHEN** item 3 (30.00) is shared 3 ways and Ann and Bob claim it
- **THEN** each pays 10.00 for it

#### Scenario: All shares taken

- **WHEN** every share of an item is held and another member taps it
- **THEN** nothing changes and they are told all shares are taken

#### Scenario: Back to a normal item

- **WHEN** the organiser removes the number of ways from an item in the Mini App
- **THEN** the item is shared equally between whoever holds it, as before

### Requirement: The claim message shows an item's shares, and unfilled shares are handled like unclaimed items

The system SHALL show an item shared in a number of ways in the claim message with its number of ways, its holders and how many shares are left. Shares still unfilled when the claiming is closed SHALL be handled like unclaimed items: the organiser chooses between covering them or splitting them evenly between those who claimed.

#### Scenario: Shares left shown

- **WHEN** item 3 is shared 3 ways and Ann and Bob claim it
- **THEN** the claim message shows both names and one share left

#### Scenario: Unfilled share

- **WHEN** the claiming is closed with one share of a 3-way item unfilled
- **THEN** the bot asks the organiser what to do with that share, as with an unclaimed item

### Requirement: A person added by name is paid for like any claimer

The system SHALL treat a person the organiser added by name or `@username` in the Mini App as a claimer without a Telegram identity, paid for like any other claimer. A typed `@username` SHALL become the same person as the Telegram user with that username when that user taps an item, with their claims merged.

#### Scenario: Plain name paid for

- **WHEN** the organiser adds `Uncle Lim` to item 2 in the Mini App and the claiming is closed
- **THEN** Uncle Lim's amount is in the summary and his QR is posted in the chat with the others

#### Scenario: Typed username taps later

- **WHEN** the organiser added `@bob_lee` to item 2 and the user with that username later taps item 3
- **THEN** item 2 and item 3 belong to one person

## REMOVED Requirements

### Requirement: Any member can claim and un-claim items

**Reason**: Replaced by two requirements: "Any member, the organiser included, can claim and un-claim items" (the organiser taps like a member) and "An item claimed by several people is shared equally, and in the chat nobody claims for another". The scenario about the organiser's menu on a locked item no longer applies.
**Migration**: None for members. The organiser's tap on an item claims it for them; other people's claims are changed in the Mini App.

### Requirement: The organiser can share an item in a number of ways

**Reason**: Replaced by "An item shared in a number of ways gives each holder one share" and "The claim message shows an item's shares, and unfilled shares are handled like unclaimed items". The number of ways is now set in the Mini App, so the chat questions (ask for the number, a number that is not valid, a number too low) go; what a share is and how the claim message shows it stay.
**Migration**: Set the number of ways in the Mini App (Edit in app).

### Requirement: The organiser's tap on an item opens a menu

**Reason**: The Mini App (Edit in app) does everything the menu did, with every item and person on one screen. Keeping both meant two implementations of the same rules.
**Migration**: The organiser's tap on an item now claims it for themselves like any member's. To change what others hold, the organiser taps Edit in app on the claim message.

### Requirement: The organiser can claim an item for someone else

**Reason**: Adding or removing a person on an item, and adding people by name or `@username`, are done in the Mini App, whose requirements state the same rules.
**Migration**: Use Edit in app on the claim message. For a split without the Mini App configured, use the typed or voice assignment instead of claiming.
