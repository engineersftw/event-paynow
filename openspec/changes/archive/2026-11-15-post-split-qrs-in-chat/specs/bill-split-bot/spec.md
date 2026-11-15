## ADDED Requirements

### Requirement: The description is asked once the bill total is known

The system SHALL ask for the optional description right after the bill total is known: after the typed total, or after the receipt scan is accepted with Use this, and before the split type, the people, the list, the assignment or the claiming. When the split came from a receipt and the user taps Skip, or the answer is empty, the description SHALL be the merchant name read from the receipt (cut to 25 characters), and when no merchant was read there SHALL be none. A description the user types SHALL always win. The question SHALL name the default when there is one. The description SHALL be the same on every QR of the split, including the QRs taken early with Get my QR.

#### Scenario: Receipt gives the default

- **WHEN** the receipt shows `Huevos @ North Bridge Road` and the user taps Skip on the description question
- **THEN** the description is the merchant name cut to 25 characters and every QR carries it

#### Scenario: Typed description wins

- **WHEN** the user types `Late lunch` for a split from a receipt
- **THEN** the description is `Late lunch`

#### Scenario: No receipt, no default

- **WHEN** the user taps Skip on a split with a typed total
- **THEN** there is no description

#### Scenario: Before the claiming

- **WHEN** the organiser lets everyone claim items
- **THEN** the description was settled before the claim message is posted, so Get my QR already carries it

#### Scenario: Amend

- **WHEN** the user amends the description on the summary
- **THEN** every QR sent afterwards carries the new description

### Requirement: The organiser always gets a QR for their own share

The system SHALL NOT ask whether the payee is the organiser. The organiser's own amount SHALL always be shown in the summary and posted as a QR in the chat when it is above zero, whether or not the organiser is the payee. An equal split SHALL be worded as everyone, the organiser included, paying the share.

#### Scenario: Equal split

- **WHEN** a bill of 100.00 is split between 4 people
- **THEN** the summary says each of the 4 people pays SGD 25.00 and one QR for it is posted

#### Scenario: Receipt split

- **WHEN** the organiser's items come to 24.00 of a 72.00 receipt
- **THEN** the summary shows the organiser's own share and a QR for SGD 24.00 is posted with their first name

#### Scenario: Custom split with a leftover

- **WHEN** the bill is 100.00, the list adds up to 80.00 and the leftover is left out
- **THEN** the organiser's own amount is SGD 20.00 and a QR for it is posted

#### Scenario: Nothing to pay

- **WHEN** the organiser's own amount is zero
- **THEN** no QR is made for the organiser

### Requirement: Every payer's QR is posted in the chat

The system SHALL post every QR of a split in the chat where the split is confirmed, one per distinct amount with the name of everyone who owes it, and SHALL NOT send any QR by direct message. This SHALL hold for plain names, @mentions, people picked from the member list, claimers and the organiser, and for the QRs taken early with Get my QR. Confirming SHALL NOT depend on the bot knowing a person's Telegram identity or being allowed to message them. A QR that Telegram refuses SHALL be reported like any other failed send.

#### Scenario: Mentions

- **WHEN** a split of `@ann 40` and `@bob 25` is confirmed
- **THEN** the chat receives a QR for Ann and a QR for Bob, each naming them, and no direct message is sent

#### Scenario: Claimers

- **WHEN** Ann and Bob claimed items and the organiser confirms
- **THEN** their QRs are posted in the chat, except for anyone who already took theirs early

#### Scenario: Already taken

- **WHEN** Ann took her QR early with Get my QR
- **THEN** the bot says in the chat that Ann's QR was already sent and does not post a second one

#### Scenario: Private chat

- **WHEN** the split is run in a private chat with the bot
- **THEN** all the QRs are posted in that chat

### Requirement: The assignment prompt says the organiser gets a QR for their share

The system SHALL say in the assignment prompt that `me` is the organiser and that a QR for the organiser's share is posted with the others.

#### Scenario: Wording

- **WHEN** the bot asks who had what
- **THEN** the text explains `me` and says the organiser's share also gets a QR

### Requirement: The organiser's QR is posted in the chat

The system SHALL take the organiser's own amount to be their items and any unassigned items they cover in a receipt split, and the leftover that was left out in a custom split. The organiser's QR SHALL be posted in the chat with the others', labelled with the organiser's first name, whether or not the organiser is the payee, and SHALL NOT be sent by direct message.

#### Scenario: In the chat

- **WHEN** the split is confirmed and the organiser's own amount is above zero
- **THEN** the QR for it is posted in the chat, with the organiser's first name on the image and caption, merged into one QR when someone else owes the same amount

#### Scenario: Organiser never started the bot

- **WHEN** the organiser has never messaged the bot privately
- **THEN** their QR is posted in the chat all the same

### Requirement: A member can get their own QR in the chat before the claiming is closed

The system SHALL show a Get my QR button on the claim message. When a member who holds at least one item taps it, the system SHALL send them a PayNow QR for their own amount to the payee already given, without waiting for the organiser's Done. The amount SHALL be the member's items (each item split equally between its holders) plus their proportional share of the difference between the receipt total and the items, calculated from the receipt's total of all items so that it does not depend on what other members claim, and rounded up to the cent. The QR SHALL be posted in the chat, with the member's name on the image and caption, and SHALL NOT be sent by direct message. A member who holds nothing SHALL be told to claim an item first. The QR SHALL carry the split's description, which is settled before the claiming begins.

#### Scenario: Member takes their QR early

- **WHEN** Ann holds item 1 and taps Get my QR while other items are unclaimed
- **THEN** a QR for her amount is posted in the chat with her name on it and claiming stays open

#### Scenario: Member never started the bot

- **WHEN** Bob has never started the bot and taps Get my QR
- **THEN** his QR is posted in the chat like anyone else's

#### Scenario: Nothing claimed

- **WHEN** a member who holds no item taps Get my QR
- **THEN** they are told to claim an item first

#### Scenario: Member without a Telegram account

- **WHEN** the organiser typed a name for a person who has no Telegram account
- **THEN** that person has no way to take a QR and is served by the shared chat QR when the claiming is closed

#### Scenario: Description included

- **WHEN** the description was settled as `Huevos` before the claiming and a member taps Get my QR
- **THEN** the QR carries the description `Huevos`

## MODIFIED Requirements

### Requirement: The bot asks for the bill, the number of people, the payee and a description

The system SHALL, when a user sends `/split` to Split_PayNow_Bot (or `/start` in a private chat), ask in order for the payee (a Singapore mobile number or a UEN), the bill total in SGD, an optional short description, whether to split Equally or with Custom amounts, and then either the number of people (equal split) or the list of names and amounts (custom split). The payee, the total and the split details are required. The description SHALL offer a Skip button and SHALL be at most 25 characters. The bot SHALL work in private chats and in group chats.

#### Scenario: Full conversation in a private chat

- **WHEN** the user sends `/split`, a valid payee and the total `187.40`, sends the description `Dinner`, taps Equally, sends the number `4`, and then confirms
- **THEN** the bot replies with a PayNow QR image for one share of the bill

#### Scenario: Skipping the description

- **WHEN** the user taps Skip on the description question and confirms
- **THEN** the QR is sent without a description

#### Scenario: Invalid total

- **WHEN** the total is not a positive amount with at most two decimals
- **THEN** the bot explains the format and asks for the total again, without moving on

#### Scenario: Invalid number of people

- **WHEN** the number of people is not a whole number from 2 to 100, or is larger than the number of cents in the total
- **THEN** the bot says what is allowed and asks again

#### Scenario: Invalid payee

- **WHEN** the payee is not a valid mobile number or UEN
- **THEN** the bot explains the accepted formats and asks again

#### Scenario: Full custom conversation

- **WHEN** the user sends `/split`, a valid payee, the total `100`, taps Skip on the description, taps Custom amounts, sends the lines `Ann 60` and `Bob 40`, and then confirms
- **THEN** the bot replies with PayNow QR images for the amounts listed

### Requirement: `/split_custom` starts a custom split directly

The system SHALL accept `/split_custom` as a shortcut that asks for the payee, then the bill total, then the optional description, and then goes straight to the custom list, without asking Equally or Custom amounts. After that it SHALL behave exactly as a custom split started from `/split`, in private chats and in groups, with the same owner-only rules in groups.

#### Scenario: Shortcut skips the choice

- **WHEN** the user sends `/split_custom`, a valid payee, a valid total, and answers or skips the description
- **THEN** the bot asks for the list of names and amounts and does not offer Equally or Custom amounts

#### Scenario: Invalid total

- **WHEN** the total after `/split_custom` and the payee is not a positive amount with at most two decimals
- **THEN** the bot explains the format and asks for the total again

#### Scenario: Restarting replaces a split in progress

- **WHEN** the owner sends `/split_custom` while a split of theirs is waiting for an answer
- **THEN** the earlier answers are discarded and the bot asks for the payee again

### Requirement: Editing a sent answer amends it

The system SHALL, when the owner edits the text of a message that answered the total, the number of people, the custom list, the payee or the description, read the new text and apply the same checks as for a new answer. When the split is waiting at the summary it SHALL show an updated summary; otherwise it SHALL ask for what is now needed. An invalid edit SHALL be refused with the reason and the earlier value kept.

#### Scenario: Edit the total at the summary

- **WHEN** the summary is shown and the user edits their total message from `100` to `120`
- **THEN** the bot shows a new summary based on 120.00

#### Scenario: Edit an earlier answer while a later question is open

- **WHEN** the bot is asking for the total and the user edits their payee message to a valid new payee
- **THEN** the bot confirms the update and keeps waiting for the total

#### Scenario: Invalid edit

- **WHEN** the user edits their total message to `abc`
- **THEN** the bot says the edit is not a valid amount and keeps the earlier total

### Requirement: The QR is for one share and never shows the payee number

The system SHALL send a PayNow QR as a fixed amount that the payer cannot change, with the description when one was given. For an equal split it SHALL send one QR for the share. For a custom or receipt split it SHALL post in the chat where the split is confirmed one QR for each distinct amount owed, the organiser's own amount included, and each QR's image and caption SHALL name the people who owe that amount. No QR SHALL be sent by direct message. The image and caption SHALL show the description, the amount and, for an equal split, the number of people, and SHALL NOT show the payee number or name. The caption SHALL remind payers to check the payee name in their banking app.

#### Scenario: QR contents

- **WHEN** a bill of 187.40 split by 4 is confirmed with the description `Dinner`
- **THEN** the QR encodes an amount of SGD 46.85 that is not editable and the description `Dinner`, and the caption does not contain the payee number

#### Scenario: QR could not be made

- **WHEN** the QR cannot be generated
- **THEN** the bot says so and asks the user to send `/split` again, without logging the answers

#### Scenario: One QR per distinct amount

- **WHEN** a custom split of Ann 40, Bob 25, Cy 25 is confirmed
- **THEN** the bot sends two QRs: SGD 40.00 labelled Ann, and SGD 25.00 labelled Bob and Cy

#### Scenario: The organiser is named too

- **WHEN** a custom split of Ann 40 and Bob 25 is confirmed and the organiser's own amount is 25.00
- **THEN** the bot posts two QRs: SGD 40.00 labelled Ann, and SGD 25.00 labelled Bob and the organiser's first name

#### Scenario: A send fails part way

- **WHEN** Telegram refuses one of several QR sends
- **THEN** the bot stops, says how many QRs were sent and how many were not, and asks the user to send `/split` again

### Requirement: The payee is asked first in every split

The system SHALL, in every split that is started with `/split`, `/split_custom`, `/split_receipt` or `/start` in a private chat, ask for the payee before anything about the bill, and SHALL keep the same order when the answers are amended: a payee changed later is checked first, then the rest of the split continues from where it was. The description SHALL be asked as soon as the bill total is known (typed, or accepted from the receipt scan) and before the split type, the people, the list, the assignment or the claiming.

#### Scenario: Payee before total

- **WHEN** the user sends `/split`
- **THEN** the first question is who should be paid, then the bill total

#### Scenario: Payee before the photo

- **WHEN** the user sends `/split_receipt`
- **THEN** the bot asks for the payee before it asks for the receipt photo

#### Scenario: Changing the payee later

- **WHEN** the user amends the payee on the summary
- **THEN** the bot asks for the new payee and then shows the summary again

### Requirement: Claimers are identified by their Telegram account

The system SHALL identify each claimer by their Telegram user id and show their first name, adding their last initial, then their username or a number, when two claimers would otherwise show the same name. At most 20 people SHALL be able to claim; a further person tapping SHALL be told the limit has been reached. A claimer's QR SHALL be posted in the chat like everyone else's.

#### Scenario: Same first name

- **WHEN** two claimers are both called Ann
- **THEN** the claim message shows them with different names

#### Scenario: Limit reached

- **WHEN** a 21st person taps an item
- **THEN** their tap changes nothing and they are told the limit is 20 people

#### Scenario: Claimer not reachable

- **WHEN** a claimer has never started the bot
- **THEN** after confirming, their QR is posted in the chat like any other

### Requirement: A receipt photo is read for the bill

The system SHALL accept `/split_receipt`, which asks for the payee and then for a photo of the receipt, and SHALL also accept a photo when the bot is asking for the bill total. It SHALL read the photo with a vision model and extract the line items with prices, the service charge, GST, any discount and the total, in SGD. If the photo is unreadable, has no total, or the reader is unavailable, the bot SHALL say so and offer to type the total instead.

#### Scenario: Photo after /split_receipt

- **WHEN** the user sends `/split_receipt`, sends a valid payee and then a clear receipt photo
- **THEN** the bot shows the numbered items, the charges and the total it read

#### Scenario: Photo instead of a total

- **WHEN** the bot asks for the bill total and the user sends a receipt photo
- **THEN** the photo is read the same way

#### Scenario: Unreadable photo

- **WHEN** the reader finds no total in the photo
- **THEN** the bot says it could not read the receipt and offers Send another photo and Type the total instead

#### Scenario: Reader not available

- **WHEN** receipt reading is not configured
- **THEN** the bot says scanning is not available and continues with a typed total

### Requirement: The receipt split continues as a custom split

The system SHALL, once items are assigned, continue as a custom split with the computed amounts: the summary with Confirm, Amend and Cancel, and one QR per distinct amount posted in the chat (the description was settled earlier). Amend SHALL offer Items, which asks for the assignment again, and editing the assignment message SHALL update the split like any other edited answer.

#### Scenario: Full receipt flow

- **WHEN** the user scans a receipt, taps Use this, settles the description, assigns items to `@ann` and `Bob` and confirms
- **THEN** the chat receives the QRs for Ann and Bob, and for the organiser's own share when it is above zero

#### Scenario: Amend items

- **WHEN** the user taps Amend, then Items, and sends a new assignment
- **THEN** the summary shows the new amounts

### Requirement: The organiser chooses what happens to unassigned items

The system SHALL, when an assignment leaves some receipt items out, state which items are unassigned and what they cost before charges, and ask the organiser to choose Split evenly or Leave them out. Split evenly SHALL share each unassigned item equally between everyone named in the assignment. Leave them out SHALL assign each unassigned item to the organiser as part of their own amount. The system SHALL NOT choose for the organiser, and SHALL NOT ask when every item is assigned.

#### Scenario: Split evenly

- **WHEN** item 3 (9.00) is unassigned and the message names Ann and Bob, and the organiser chooses Split evenly
- **THEN** Ann and Bob each carry 4.50 of item 3, plus their share of the charges

#### Scenario: Leave them out

- **WHEN** item 3 is unassigned and the organiser chooses Leave them out
- **THEN** item 3 counts as the organiser's, the summary shows the organiser's share, and the organiser's QR includes it

#### Scenario: Everything assigned

- **WHEN** every item appears in the assignment
- **THEN** the bot does not ask about unassigned items

#### Scenario: The question names the items

- **WHEN** items 2 and 5 are unassigned
- **THEN** the question lists items 2 and 5 and their combined price

### Requirement: Only the organiser closes the claiming

The system SHALL let only the organiser close the claim with Done. When every item is claimed, Done SHALL compute the amounts and continue to the summary. When some items are unclaimed, Done SHALL ask the organiser with the existing unassigned-items choice, worded for claimers: Split evenly between those who claimed, Leave them out: I cover them, or Keep claiming, and SHALL not choose for them. Done SHALL be refused until someone other than the organiser has claimed an item.

#### Scenario: Everything claimed

- **WHEN** every item is claimed and the organiser taps Done
- **THEN** the claim message is closed and the bot shows the summary

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

- **WHEN** the organiser claimed items and the split is confirmed, whoever the payee is
- **THEN** a QR for the organiser's own amount is posted in the chat with the others'

## REMOVED Requirements

### Requirement: The organiser's own amount comes from their items or the left-out remainder
**Reason**: Replaced by a requirement that posts the organiser's QR in the chat instead of sending it by direct message.
**Migration**: See the requirements added in this change.

### Requirement: A member can get their own QR before the claiming is closed
**Reason**: Replaced by the same requirement with the QR posted in the chat.
**Migration**: See the requirements added in this change.

### Requirement: Mentioned people receive their QR by direct message
**Reason**: Every payer's QR is posted in the chat; direct messages depended on the bot knowing who a person is and being allowed to message them.
**Migration**: See the requirements added in this change.

### Requirement: People the bot cannot message get a Get my QR button
**Reason**: No QR is sent by direct message any more, so nobody is left waiting for one. Waiting QRs created earlier can still be collected until they expire.
**Migration**: See the requirements added in this change.

### Requirement: The bot asks whether the payee is the organiser
**Reason**: The question is removed; the organiser always gets a QR for their own share.
**Migration**: See the requirements added in this change.

### Requirement: When someone else is paid, the organiser pays their own share
**Reason**: Replaced by the requirement that the organiser always gets a QR for their own share.
**Migration**: See the requirements added in this change.

### Requirement: The summary and QR wording follow the answer
**Reason**: The wording no longer depends on who the payee is.
**Migration**: See the requirements added in this change.

### Requirement: The assignment prompt does not promise an uncollected share
**Reason**: Replaced by a prompt that says the organiser gets a QR for their share.
**Migration**: See the requirements added in this change.
