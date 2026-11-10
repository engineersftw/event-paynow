## ADDED Requirements

### Requirement: In a group the organiser can let members claim the items

The system SHALL, in a group chat after the user taps Use this on a receipt scan, ask whether the organiser will type who had each item or let everyone claim. Choosing to type SHALL continue as before. Choosing to let everyone claim SHALL post one claim message. In a private chat the question SHALL NOT be asked and the organiser types the assignment.

#### Scenario: Choice in a group

- **WHEN** the organiser taps Use this on a scan in a group chat
- **THEN** the bot offers "I'll type it" and "Let everyone claim"

#### Scenario: No choice in a private chat

- **WHEN** the organiser taps Use this on a scan in a private chat
- **THEN** the bot asks who had each item, as before

### Requirement: Any member can claim and un-claim items

The system SHALL show in the claim message each numbered item with its price and the names of the people who have claimed it, with one button per item. Any member of the group SHALL be able to tap an item to claim it for themselves and tap it again to un-claim it, and the message SHALL update after each tap. An item claimed by several people SHALL be shared equally between them. A member SHALL NOT be able to claim for, or un-claim for, anyone else.

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

### Requirement: Claimers are identified by their Telegram account

The system SHALL identify each claimer by their Telegram user id and show their first name, adding their last initial, then their username or a number, when two claimers would otherwise show the same name. At most 20 people SHALL be able to claim; a further person tapping SHALL be told the limit has been reached. A claimer SHALL be treated as a mentioned person when the split is sent, so they receive their QR by direct message when the bot can message them.

#### Scenario: Same first name

- **WHEN** two claimers are both called Ann
- **THEN** the claim message shows them with different names

#### Scenario: Limit reached

- **WHEN** a 21st person taps an item
- **THEN** their tap changes nothing and they are told the limit is 20 people

#### Scenario: Claimer not reachable

- **WHEN** a claimer has never started the bot
- **THEN** after confirming, they get a Get my QR button like any other mentioned person

### Requirement: Only the organiser closes the claiming

The system SHALL let only the organiser close the claim with Done. When every item is claimed, Done SHALL compute the amounts and continue to the payee question. When some items are unclaimed, Done SHALL ask the organiser with the existing unassigned-items choice, worded for claimers: Split evenly between those who claimed, Leave them out: I cover them, or Keep claiming, and SHALL not choose for them. Done SHALL be refused until someone other than the organiser has claimed an item.

#### Scenario: Everything claimed

- **WHEN** every item is claimed and the organiser taps Done
- **THEN** the claim message is closed and the bot asks for the payee

#### Scenario: Unclaimed items covered by the organiser

- **WHEN** item 4 is unclaimed and the organiser chooses Leave them out: I cover them
- **THEN** item 4 counts as the organiser's

#### Scenario: Unclaimed items shared

- **WHEN** item 4 is unclaimed and the organiser chooses Split evenly between those who claimed
- **THEN** item 4 is split equally between everyone who claimed at least one item

#### Scenario: Keep claiming

- **WHEN** the organiser chooses Keep claiming
- **THEN** the bot shows the claim message again with the claims so far and members can continue

#### Scenario: Nobody else has claimed

- **WHEN** only the organiser has claimed items and taps Done
- **THEN** the bot says someone else must claim an item first

#### Scenario: A member taps Done

- **WHEN** a member who is not the organiser taps Done
- **THEN** nothing changes and they are told it is the organiser's button

#### Scenario: Organiser's own claimed share when someone else paid

- **WHEN** the organiser claimed items and then answers that someone else is the payee
- **THEN** the organiser's own amount is collected like the others' and a QR for it is sent to the organiser

### Requirement: Claims become the same amounts as a typed assignment

The system SHALL compute each claimer's amount exactly as for a typed assignment: each item shared equally between its claimers, the difference between the receipt total and the items shared in proportion, and all amounts, including the organiser's, adding up to the receipt total. The split SHALL then continue as a custom split with the claimers as the people to collect from.

#### Scenario: Claimed amounts

- **WHEN** Ann claims a 30.00 item, Bob a 10.00 item, and the receipt total is 48.00
- **THEN** Ann owes 36.00 and Bob owes 12.00

### Requirement: Claiming stays open for an hour

The system SHALL keep the claim message and its claims for one hour after the last tap, each tap restarting that hour. After that hour of inactivity the split SHALL lapse and the claim buttons SHALL answer that the step is over. Every other step SHALL keep the usual ten-minute limit.

#### Scenario: Slow table

- **WHEN** a member taps an item 40 minutes after the previous tap
- **THEN** the claim is recorded

#### Scenario: Lapsed

- **WHEN** nobody taps for an hour
- **THEN** the split lapses and a later tap is told that step is over

### Requirement: Amending the items reopens the choice

The system SHALL, when the organiser chooses Items from Amend on a receipt split, ask again whether to type or let everyone claim, keeping the earlier claims when claiming is reopened.

#### Scenario: Reopen claiming

- **WHEN** the organiser amends Items and chooses Let everyone claim
- **THEN** a new claim message shows the earlier claims and members can change them

## MODIFIED Requirements

### Requirement: The user reviews what was read before it is used

The system SHALL show the items, charges and total it read, with Use this, Send another photo and Type the total instead buttons (one per row, with Add a missing item above them when offered), and SHALL NOT continue until the user chooses. It SHALL warn when the items add up to more than the total, or when a price or total looks invalid. Using the scan SHALL set the bill total to the receipt total.

#### Scenario: Use this

- **WHEN** the user taps Use this in a private chat
- **THEN** the bill total is the receipt total and the bot asks who had each item

#### Scenario: Use this in a group

- **WHEN** the user taps Use this in a group chat
- **THEN** the bill total is the receipt total and the bot asks whether to type the assignment or let everyone claim

#### Scenario: Items exceed the total

- **WHEN** the items add up to more than the total on the receipt
- **THEN** the review shows a warning that the numbers do not add up

#### Scenario: Type the total instead

- **WHEN** the user taps Type the total instead
- **THEN** the bot asks for the bill total as in a normal split

#### Scenario: Added items are used

- **WHEN** the user added a missing item and then taps Use this
- **THEN** the added item is part of the items the bot asks who had

### Requirement: Receipt photos are not kept

The system SHALL process a receipt photo in memory, SHALL NOT store the photo, and SHALL NOT log its contents. The items, prices, claims and assignment SHALL be kept only in the chat's conversation state, which is discarded when the split ends, after 10 minutes of inactivity, or after one hour of inactivity while items are being claimed.

#### Scenario: Nothing written

- **WHEN** a receipt split is confirmed
- **THEN** no receipt data remains in the database and the conversation state is cleared

#### Scenario: Conversation expires

- **WHEN** a receipt split has been idle for 10 minutes outside the claiming step
- **THEN** the scan result and assignment are discarded

### Requirement: In a group only the person who started the split can answer

The system SHALL, in a group chat, accept text and button taps for a split only from the user who sent `/split` and only in the same topic, except that any member MAY tap the item buttons of the claim message. Messages from anyone else SHALL be ignored without a reply, and a button tap from someone else, other than a claim tap, is answered with a short "not your split" notice. The bot SHALL try to delete the owner's payee message from the group once it has read it, and a failure to delete SHALL NOT stop the conversation.

#### Scenario: Another member replies

- **WHEN** a different group member types a number while a split is waiting for an answer from the owner
- **THEN** the bot ignores it and the split continues unchanged

#### Scenario: Another member taps a button

- **WHEN** a different group member taps Confirm on the summary
- **THEN** nothing is generated and the member sees a notice that the split is not theirs

#### Scenario: Another member claims an item

- **WHEN** a different group member taps an item on the claim message
- **THEN** the claim is recorded for that member

#### Scenario: Payee message removed

- **WHEN** the owner types the payee in a group where the bot may delete messages
- **THEN** the bot deletes that message

#### Scenario: Cannot delete

- **WHEN** the bot may not delete messages in the group
- **THEN** the conversation continues normally

### Requirement: The bot stores nothing and is off until configured

The system SHALL keep a split's answers only in the chat's Durable Object until the QR is sent, the user cancels or the conversation expires after 10 minutes of inactivity (one hour while items are being claimed), and SHALL NOT log the bill, payee, description or identities. The only data it keeps beyond that is the contact record (username and user id, until `/forget`) and a waiting QR (until collected or 48 hours). The bot's webhook SHALL answer 404 until its token, webhook secret and username are configured, and SHALL reject a request with a wrong secret token.

#### Scenario: Not configured

- **WHEN** a request reaches `/webhook/split` and the bot's token or webhook secret is not set
- **THEN** the route answers 404

#### Scenario: Wrong secret

- **WHEN** a request to `/webhook/split` carries a wrong `X-Telegram-Bot-Api-Secret-Token`
- **THEN** the route answers 403 and does not run the bot

#### Scenario: Conversation expires

- **WHEN** a split has been idle for 10 minutes outside the claiming step
- **THEN** its answers are discarded and a later reply is ignored

#### Scenario: Nothing kept for an equal split

- **WHEN** an equal split or a custom split with no mentions is confirmed
- **THEN** no contact record or waiting QR is written
