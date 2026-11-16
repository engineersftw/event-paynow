## MODIFIED Requirements

### Requirement: The organiser can add or remove people on an item

The system SHALL let the organiser, in the app, tap a person on an item to add or remove them, claim an item for themselves, and remove all claims from an item. A person SHALL NOT hold two shares of the same item, and an item whose shares are all held SHALL refuse another person.

#### Scenario: Add a person

- **WHEN** the organiser taps Ann on item 3
- **THEN** Ann holds item 3 and the claim message in the chat shows it

#### Scenario: Remove a person

- **WHEN** Ann holds item 3 and the organiser taps Ann on item 3
- **THEN** Ann no longer holds it

#### Scenario: Remove all claims

- **WHEN** item 3 is held by Ann and Bob and the organiser removes all its claims
- **THEN** item 3 has no holders and keeps its number of ways

#### Scenario: Every share taken

- **WHEN** a 3-way item is held by three people and the organiser adds a fourth
- **THEN** the app refuses and says all shares are taken

#### Scenario: The organiser claims for themselves

- **WHEN** the organiser taps Me on item 3 in the app
- **THEN** the organiser holds item 3, and tapping again takes it back

### Requirement: The organiser can add people by name in the app

The system SHALL let the organiser add a person to the claim by typing a name or an `@username`. A name matching an existing person (ignoring case) SHALL reuse that person, a name longer than 20 characters SHALL be refused, a plain name SHALL have no Telegram identity, and the total number of people SHALL NOT exceed 20.

#### Scenario: Plain name

- **WHEN** the organiser types `Uncle Lim` in the app and puts him on item 2
- **THEN** Uncle Lim holds item 2 and is included in the amounts

#### Scenario: Existing person

- **WHEN** the organiser types `ann` and Ann is already a person
- **THEN** Ann is used, not a second Ann

#### Scenario: Name too long

- **WHEN** the organiser types a name of 21 characters
- **THEN** the app refuses it and says it is too long

#### Scenario: Too many people

- **WHEN** 20 people already hold items and the organiser adds another
- **THEN** the app refuses and says up to 20 people can claim

### Requirement: The organiser can share an item in a number of ways in the app

The system SHALL let the organiser set an item to be shared 2 to 20 ways, change it, or remove it. Each holder holds one share, and the number SHALL NOT be set below the number of people who already hold the item.

#### Scenario: Share an item

- **WHEN** the organiser sets item 3 to 3 ways
- **THEN** the app and the claim message show item 3 as shared 3 ways with its holders and the shares left

#### Scenario: Number too low

- **WHEN** three people hold an item and the organiser sets it to 2 ways
- **THEN** the app refuses and says three people already hold it

#### Scenario: Not a valid number

- **WHEN** the organiser sets the number of ways to 1 or 21
- **THEN** the app refuses and says a whole number from 2 to 20 is needed

#### Scenario: Remove the ways

- **WHEN** the organiser removes the number of ways from an item
- **THEN** the item is shared equally between its holders

### Requirement: Changes from the app and from the chat are all kept

The system SHALL apply a change from the app on the newest claims, so that members' taps in the chat and the app's changes made at the same moment are all recorded and none overwrites another. After a change, the claim message in the chat SHALL show the new claims.

#### Scenario: Simultaneous changes

- **WHEN** a member taps item 2 in the chat while the organiser sets item 5 to 3 ways in the app
- **THEN** both changes are recorded

#### Scenario: Claim message follows

- **WHEN** the organiser adds Ann to item 3 in the app
- **THEN** the claim message in the chat shows Ann on item 3
