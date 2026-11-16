# split-claim-app Specification

## Purpose

Lets the organiser of a group's self-claim receipt split see every item and every person on one screen inside Telegram and change who has what for everyone: add or remove people, add someone by name, share an item in a number of ways, or clear an item.

## Requirements

### Requirement: The claim message offers the app to the organiser

The system SHALL add an Edit in app button to the claim message of a group's self-claim split when the Mini App is configured. The button SHALL open the Mini App for that chat. When the Mini App is not configured, the claim message SHALL be exactly as it is without this feature.

#### Scenario: Configured

- **WHEN** the claim message is posted and the Mini App is configured
- **THEN** it shows the item buttons, Get my QR, Done and an Edit in app button

#### Scenario: Not configured

- **WHEN** the claim message is posted and the Mini App is not configured
- **THEN** it has no Edit in app button

#### Scenario: A member opens it

- **WHEN** a member who is not the organiser taps Edit in app
- **THEN** the app opens and tells them only the organiser can change the claims

### Requirement: Only the organiser can use the app

The system SHALL accept a request from the app only when Telegram's signed launch data is valid for the Split bot, was issued within the last 24 hours, and names the organiser of the chat's active claiming conversation. Every other request SHALL be refused and SHALL change nothing.

#### Scenario: The organiser

- **WHEN** the organiser opens the app from the claim message
- **THEN** the app shows the items and the people

#### Scenario: A member or a stranger

- **WHEN** someone other than the organiser calls the app's interface for that chat
- **THEN** the request is refused and no claim changes

#### Scenario: Forged or old launch data

- **WHEN** a request carries launch data with a wrong signature, or one issued more than 24 hours ago
- **THEN** it is refused

#### Scenario: No claiming in progress

- **WHEN** the organiser opens the app after the claiming was closed or cancelled, or after it expired
- **THEN** the app says the claiming is over and offers no changes

### Requirement: The app shows who has what

The system SHALL show, in the app, every item with its name, price, holders and number of ways, a marker on locked items, and every person who holds something. The view SHALL follow changes made by members in the chat within a few seconds, without the organiser reloading.

#### Scenario: Items and holders

- **WHEN** Ann holds item 1 and Bob holds items 1 and 2
- **THEN** the app shows item 1 with Ann and Bob, and item 2 with Bob

#### Scenario: A member claims in the chat

- **WHEN** the app is open and a member claims item 3 in the chat
- **THEN** the app shows that member on item 3 within a few seconds

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

### Requirement: The organiser can add everyone to an item in one step

The system SHALL let the organiser add every person listed in the app to an item in one step. Only people who do not hold the item and have not taken their QR SHALL be added. When the item is shared in a number of ways and fewer shares are left than people to add, the system SHALL add nobody and say how many shares are left.

#### Scenario: Add everyone

- **WHEN** Ann, Bob and the organiser are listed, Ann holds item 3, and the organiser adds everyone to item 3
- **THEN** Bob and the organiser join Ann on item 3

#### Scenario: Skips a person with a QR

- **WHEN** Bob has taken his QR and the organiser adds everyone to item 3
- **THEN** everyone except Bob is added

#### Scenario: Everyone is already on it

- **WHEN** every listed person already holds item 3
- **THEN** the app says everyone is already on it and changes nothing

#### Scenario: Not enough shares

- **WHEN** item 3 is shared 3 ways, holds one person, and four more people are listed
- **THEN** nobody is added and the app says two shares are left

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

### Requirement: Locked items cannot be changed in the app

The system SHALL show an item as locked, and refuse every change to it, when anyone on it has already taken their QR. A person who has taken their QR SHALL NOT be added to another item.

#### Scenario: Locked item

- **WHEN** Ann holds item 3 and has taken her QR
- **THEN** the app shows item 3 as locked and refuses to change it

#### Scenario: Person with a QR

- **WHEN** Ann has taken her QR and the organiser tries to add her to item 4
- **THEN** the app refuses and says she already has her QR

### Requirement: Changes from the app and from the chat are all kept

The system SHALL apply a change from the app on the newest claims, so that members' taps in the chat and the app's changes made at the same moment are all recorded and none overwrites another. After a change, the claim message in the chat SHALL show the new claims.

#### Scenario: Simultaneous changes

- **WHEN** a member taps item 2 in the chat while the organiser sets item 5 to 3 ways in the app
- **THEN** both changes are recorded

#### Scenario: Claim message follows

- **WHEN** the organiser adds Ann to item 3 in the app
- **THEN** the claim message in the chat shows Ann on item 3

### Requirement: The app does not close the claiming

The system SHALL leave closing the claiming, choosing what happens to unassigned items, the summary and Confirm to the chat. The app SHALL change claims only, and SHALL stop offering changes as soon as the claiming is over.

#### Scenario: Done in the chat

- **WHEN** the organiser taps Done in the chat while the app is open
- **THEN** the app shows that the claiming is over and offers no changes

#### Scenario: Nothing to finish in the app

- **WHEN** the organiser looks for a Done or Confirm in the app
- **THEN** there is none; the app tells them to finish in the chat

### Requirement: The app keeps nothing outside the conversation

The system SHALL read and write the claims only in the chat's conversation state, where they already live, and SHALL NOT store, log or send elsewhere the items, names, amounts or launch data it handles. The Mini App and its interface SHALL answer only when configured; otherwise they SHALL answer as if they did not exist.

#### Scenario: Nothing stored

- **WHEN** the organiser makes changes in the app and the split is finished
- **THEN** nothing about them remains beyond what the chat's split already keeps until it ends

#### Scenario: Not configured

- **WHEN** the Mini App is not configured and its address is requested
- **THEN** the answer is Not found

### Requirement: The app shows when it is waiting for the server

The system SHALL show a spinner with the words "Updating…" in the app for as long as the first load or a change the organiser made is waiting for an answer. While it waits, the app SHALL dim the items and keep them from being tapped, and the spinner and the dimming SHALL be gone once the answer or an error has arrived. The refresh the app makes by itself every few seconds SHALL NOT show the spinner or dim the items.

#### Scenario: A change is waiting

- **WHEN** the organiser taps Add and the answer has not arrived
- **THEN** the spinner is shown, the items are dimmed and a second tap does nothing

#### Scenario: The answer arrives

- **WHEN** the answer to the change arrives
- **THEN** the spinner and the dimming are gone and the items show the new claims

#### Scenario: A change is refused

- **WHEN** the app refuses a change, for example a name that is too long
- **THEN** the reason is shown and the spinner is gone

#### Scenario: No connection

- **WHEN** the request fails because there is no connection
- **THEN** the spinner is gone and the app says so

#### Scenario: First load

- **WHEN** the app opens and the items have not arrived yet
- **THEN** the spinner is shown until they do

#### Scenario: The background refresh

- **WHEN** the app refreshes by itself while nobody is making a change
- **THEN** no spinner is shown and the items are not dimmed

### Requirement: The app is answered before the chat message is updated

The system SHALL answer a change made in the app as soon as the change is recorded, without waiting for the claim message in the chat to be edited. It SHALL then bring that message up to date, and the message SHALL show the newest claims even when several changes come close together or an earlier update finishes late.

#### Scenario: The chat is slow

- **WHEN** the organiser makes a change in the app and Telegram takes several seconds to accept the edit of the claim message
- **THEN** the app shows the new claims at once, and the claim message in the chat shows them when the edit is accepted

#### Scenario: Quick changes

- **WHEN** the organiser makes two changes in the app within the time one edit takes
- **THEN** the claim message ends up showing both changes

#### Scenario: A change from the chat in between

- **WHEN** a member taps an item in the chat while the claim message is being brought up to date after an app change
- **THEN** the claim message ends up showing both the member's claim and the app's change

### Requirement: An update does not start once the claiming has been closed

The system SHALL check, just before it edits the claim message in the chat, that the claiming is still open, and SHALL NOT edit the message when it is not, so that an update that was waiting does not put the claim buttons back on a message the chat has closed.

#### Scenario: Done in the chat first

- **WHEN** the organiser changes an item in the app and taps Done in the chat before the claim message has started to be brought up to date
- **THEN** the message is not edited by the update and stays closed

#### Scenario: Cancelled first

- **WHEN** the split is cancelled before the claim message has started to be brought up to date
- **THEN** the message is not edited
