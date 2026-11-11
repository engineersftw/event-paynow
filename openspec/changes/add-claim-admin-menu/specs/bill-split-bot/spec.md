## ADDED Requirements

### Requirement: The organiser's tap on an item opens a menu

The system SHALL, when the organiser taps an item in the claim message, post a menu for that item instead of claiming it directly, with the buttons Mine, one for each person who has claimed something, Someone else, Shared by all and Close, and, when the item already has claimants, a Remove all claims button that empties the item in one tap. This SHALL replace, for the organiser only, the rule that a tap claims the item for the tapper; other members' taps are unchanged. The menu SHALL stay open for several choices and update itself, and SHALL be removed when the organiser taps Close, taps Done or Keep claiming, or opens the menu for another item. Only the organiser SHALL be able to use the menu.

#### Scenario: Organiser taps an item

- **WHEN** the organiser taps item 3 in the claim message
- **THEN** the bot posts a menu for item 3 with Mine, the people who have claimed, Someone else, Shared by all and Close

#### Scenario: Clear all claims

- **WHEN** item 3 is held by Ann and Bob and the organiser taps it again and then Remove all claims
- **THEN** item 3 has no claimants in the claim message, its number of ways is kept, and the menu no longer offers Remove all claims

#### Scenario: No claims to remove

- **WHEN** the organiser opens the menu for an item nobody holds
- **THEN** there is no Remove all claims button

#### Scenario: Remove one person

- **WHEN** item 3 is held by Ann and Bob and the organiser taps Ann in the menu
- **THEN** only Ann is removed from item 3

#### Scenario: Mine

- **WHEN** the organiser taps Mine in the menu for item 3
- **THEN** item 3 is claimed by the organiser, shown in the claim message, and tapping Mine again removes it

#### Scenario: Member taps the menu

- **WHEN** a member who is not the organiser taps a button of the menu
- **THEN** nothing changes and they are told it is the organiser's button

#### Scenario: Menu closed

- **WHEN** the organiser taps Close, Done or Keep claiming
- **THEN** the menu message is removed

### Requirement: The organiser can claim an item for someone else

The system SHALL let the organiser add a person to an item, or remove them, by tapping that person in the menu; a tapped person who already holds the item SHALL be removed from it. The organiser SHALL also be able to tap Someone else and send one or more names or @mentions separated by commas, and each SHALL be added to the item. A person picked from the member list SHALL be identified by their Telegram account, an @username SHALL be matched to an existing claimer or kept so their QR can be delivered when they start the bot, and a plain name SHALL have no identity. A name matching an existing claimer SHALL reuse that claimer. A name longer than 20 characters SHALL be refused. The people added this way SHALL count towards the 20-person limit and SHALL be paid for like any claimer.

#### Scenario: Pick a claimer

- **WHEN** the organiser taps Ann in the menu for item 3
- **THEN** Ann is shown against item 3 in the claim message

#### Scenario: Plain name

- **WHEN** the organiser taps Someone else and sends `Uncle Lim` for item 2
- **THEN** Uncle Lim is shown against item 2 and is included in the amounts

#### Scenario: Several people

- **WHEN** the organiser sends `Ann, @bob_lee` for item 2
- **THEN** both are added to item 2

#### Scenario: Name too long

- **WHEN** the organiser sends a name longer than 20 characters
- **THEN** the bot refuses it and asks again

#### Scenario: Typed person taps later

- **WHEN** a typed @username later taps an item in the claim message
- **THEN** their claims and the typed ones belong to the same person

### Requirement: The organiser can share an item in a number of ways

The system SHALL, when the organiser taps Shared by all, ask how many ways to split the item, with a whole number from 2 to 20. The item SHALL become that many equal shares, with any odd cents on the first shares, and each person who claims the item SHALL hold one share and pay one share. A person SHALL NOT hold two shares of the same item, and claims on the item SHALL stop when every share is held. The claim message SHALL show the item with its number of ways, its holders and how many shares are left. The number of ways SHALL be changeable and removable from the same menu, but SHALL NOT be set below the number of people who already hold the item. Shares that are still unfilled when the claiming is closed SHALL be handled like unclaimed items: the organiser chooses between covering them or splitting them evenly between those who claimed.

#### Scenario: Ask for the number

- **WHEN** the organiser taps Shared by all in the menu for item 3
- **THEN** the bot asks how many ways to split it and accepts a number from 2 to 20

#### Scenario: Shares claimed

- **WHEN** item 3 (30.00) is shared 3 ways and Ann and Bob claim it
- **THEN** the claim message shows both names and one share left, and each pays 10.00 for it

#### Scenario: All shares taken

- **WHEN** every share of an item is held and another member taps it
- **THEN** nothing changes and they are told all shares are taken

#### Scenario: Unfilled share

- **WHEN** the claiming is closed with one share of a 3-way item unfilled
- **THEN** the bot asks the organiser what to do with that share, as with an unclaimed item

#### Scenario: Number too low

- **WHEN** three people hold an item and the organiser sets it to 2 ways
- **THEN** the bot refuses and says three people already hold it

#### Scenario: Back to a normal item

- **WHEN** the organiser removes the number of ways from an item
- **THEN** the item is shared equally between whoever holds it, as before

#### Scenario: Not a valid number

- **WHEN** the organiser sends 1 or `lots` as the number of ways
- **THEN** the bot says a whole number from 2 to 20 is needed and asks again

## MODIFIED Requirements

### Requirement: Claims become the same amounts as a typed assignment

The system SHALL compute each claimer's amount exactly as for a typed assignment: each item shared equally between its claimers (an item shared N ways costs each holder one Nth, and unfilled shares are handled as unclaimed items), the difference between the receipt total and the items shared in proportion, and all amounts, including the organiser's, adding up to the receipt total. The split SHALL then continue as a custom split with the claimers as the people to collect from.

#### Scenario: Claimed amounts

- **WHEN** Ann claims a 30.00 item, Bob a 10.00 item, and the receipt total is 48.00
- **THEN** Ann owes 36.00 and Bob owes 12.00

#### Scenario: Item shared three ways

- **WHEN** a 30.00 item is shared 3 ways, Ann and Bob hold a share each, and the organiser covers the unfilled share
- **THEN** Ann and Bob each owe 10.00 for it and the organiser's own share includes the other 10.00
