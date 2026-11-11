## ADDED Requirements

### Requirement: The payee is asked first in every split

The system SHALL, in every split that is started with `/split`, `/split_custom`, `/split_receipt` or `/start` in a private chat, ask for the payee and whether the payee is the user before anything about the bill, and SHALL keep the same order when the answers are amended: a payee changed later is checked first, then the rest of the split continues from where it was. The description SHALL remain the last question.

#### Scenario: Payee before total

- **WHEN** the user sends `/split`
- **THEN** the first question is who should be paid, then whether the payee is the user, then the bill total

#### Scenario: Payee before the photo

- **WHEN** the user sends `/split_receipt`
- **THEN** the bot asks for the payee and whether it is the user before it asks for the receipt photo

#### Scenario: Changing the payee later

- **WHEN** the user amends the payee on the summary
- **THEN** the bot asks for the new payee and whether it is the user, and then shows the summary again

## MODIFIED Requirements

### Requirement: The bot asks for the bill, the number of people, the payee and a description

The system SHALL, when a user sends `/split` to Split_PayNow_Bot (or `/start` in a private chat), ask in order for the payee (a Singapore mobile number or a UEN), whether the payee is the user, the bill total in SGD, whether to split Equally or with Custom amounts, then either the number of people (equal split) or the list of names and amounts (custom split), and an optional short description. The payee, the total and the split details are required. The description SHALL offer a Skip button and SHALL be at most 25 characters. The bot SHALL work in private chats and in group chats.

#### Scenario: Full conversation in a private chat

- **WHEN** the user sends `/split`, a valid payee, taps Yes, it's me, sends the total `187.40`, taps Equally, sends the number `4` and the description `Dinner`, and then confirms
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

- **WHEN** the user sends `/split`, a valid payee, taps Yes, it's me, sends the total `100`, taps Custom amounts, sends the lines `Ann 60` and `Bob 40` and taps Skip, and then confirms
- **THEN** the bot replies with PayNow QR images for the amounts listed

### Requirement: `/split_custom` starts a custom split directly

The system SHALL accept `/split_custom` as a shortcut that asks for the payee and whether the payee is the user, then the bill total, and then goes straight to the custom list, without asking Equally or Custom amounts. After that it SHALL behave exactly as a custom split started from `/split`, in private chats and in groups, with the same owner-only rules in groups.

#### Scenario: Shortcut skips the choice

- **WHEN** the user sends `/split_custom`, answers the payee questions and then sends a valid total
- **THEN** the bot asks for the list of names and amounts and does not offer Equally or Custom amounts

#### Scenario: Invalid total

- **WHEN** the total after `/split_custom` and the payee questions is not a positive amount with at most two decimals
- **THEN** the bot explains the format and asks for the total again

#### Scenario: Restarting replaces a split in progress

- **WHEN** the owner sends `/split_custom` while a split of theirs is waiting for an answer
- **THEN** the earlier answers are discarded and the bot asks for the payee again

### Requirement: A receipt photo is read for the bill

The system SHALL accept `/split_receipt`, which asks for the payee and whether the payee is the user and then for a photo of the receipt, and SHALL also accept a photo when the bot is asking for the bill total. It SHALL read the photo with a vision model and extract the line items with prices, the service charge, GST, any discount and the total, in SGD. If the photo is unreadable, has no total, or the reader is unavailable, the bot SHALL say so and offer to type the total instead.

#### Scenario: Photo after /split_receipt

- **WHEN** the user sends `/split_receipt`, answers the payee questions and then sends a clear receipt photo
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

### Requirement: Editing a sent answer amends it

The system SHALL, when the owner edits the text of a message that answered the total, the number of people, the custom list, the payee or the description, read the new text and apply the same checks as for a new answer. When the split is waiting at the summary it SHALL show an updated summary; otherwise it SHALL ask for what is now needed. An invalid edit SHALL be refused with the reason and the earlier value kept.

#### Scenario: Edit the total at the summary

- **WHEN** the summary is shown and the user edits their total message from `100` to `120`
- **THEN** the bot shows a new summary based on 120.00

#### Scenario: Edit an earlier answer while a later question is open

- **WHEN** the bot is asking for the total and the user edits their payee message to a valid new payee
- **THEN** the bot confirms the update, asks again whether the new payee is the user, and then keeps waiting for the total

#### Scenario: Invalid edit

- **WHEN** the user edits their total message to `abc`
- **THEN** the bot says the edit is not a valid amount and keeps the earlier total

### Requirement: The custom list is checked against the bill total

The system SHALL compare the sum of the listed amounts with the bill total. A sum above the total SHALL be rejected, telling the user by how much it is over, and the list asked for again. A sum equal to the total SHALL continue to the description question. A sum below the total SHALL ask what to do with the leftover, with two buttons: Split it evenly between the people listed, or Leave it out.

#### Scenario: Over the bill

- **WHEN** the bill is 100.00 and the list adds up to 110.00
- **THEN** the bot says the list is SGD 10.00 over the bill and asks for the list again

#### Scenario: Exactly the bill

- **WHEN** the bill is 100.00 and the list adds up to 100.00
- **THEN** the bot does not ask about a leftover and asks for the description

#### Scenario: Leftover left out

- **WHEN** the bill is 100.00, the list adds up to 80.00 and the user taps Leave it out
- **THEN** every person keeps the amount listed and the organiser covers SGD 20.00

#### Scenario: Leftover split evenly

- **WHEN** the bill is 100.00, the list is `Ann 40` and `Bob 40`, and the user taps Split it evenly
- **THEN** each of the two people owes SGD 10.00 more, so Ann and Bob each owe SGD 50.00

#### Scenario: Leftover split evenly with rounding

- **WHEN** the leftover is SGD 10.00 and 3 people are listed
- **THEN** each person is charged SGD 3.34 of it, and the summary shows that the amounts add up to SGD 0.02 more than the bill

### Requirement: The receipt split continues as a custom split

The system SHALL, once items are assigned, continue as a custom split with the computed amounts: the optional description (the payee was asked first), the summary with Confirm, Amend and Cancel, one QR per distinct amount, and direct messages to mentioned people. Amend SHALL offer Items, which asks for the assignment again, and editing the assignment message SHALL update the split like any other edited answer.

#### Scenario: Full receipt flow

- **WHEN** the user scans a receipt, taps Use this, assigns items to `@ann` and `Bob` and confirms
- **THEN** Ann is sent her QR by direct message and the chat receives a QR for Bob

#### Scenario: Amend items

- **WHEN** the user taps Amend, then Items, and sends a new assignment
- **THEN** the summary shows the new amounts

### Requirement: The bot asks whether the payee is the organiser

The system SHALL, straight after the payee is entered in any split (equal, custom or receipt), ask whether the payee is the organiser, with the buttons "Yes, it's me" and "No, someone else", before the bill total or the receipt photo is asked for. The answer SHALL be kept with the split and SHALL be asked again whenever the payee is changed by amending or editing. Once the question is answered the system SHALL remove its buttons and replace its text with the answer: "Payment was made by you." or "Payment was made by someone else."

#### Scenario: Question after the payee

- **WHEN** the user enters a valid payee
- **THEN** the bot asks whether the payee is the user, with Yes and No buttons

#### Scenario: Answer shown

- **WHEN** the user taps Yes, it's me
- **THEN** the buttons disappear and the message reads "Payment was made by you."

#### Scenario: Answer shown for someone else

- **WHEN** the user taps No, someone else
- **THEN** the buttons disappear and the message reads "Payment was made by someone else."

#### Scenario: Payee changed

- **WHEN** the user amends or edits the payee
- **THEN** the bot asks again whether the new payee is the user, in a new message

#### Scenario: Only the organiser answers in a group

- **WHEN** a different group member taps a button of that question
- **THEN** nothing changes and they are told the split is not theirs

### Requirement: Only the organiser closes the claiming

The system SHALL let only the organiser close the claim with Done. When every item is claimed, Done SHALL compute the amounts and continue to the description question. When some items are unclaimed, Done SHALL ask the organiser with the existing unassigned-items choice, worded for claimers: Split evenly between those who claimed, Leave them out: I cover them, or Keep claiming, and SHALL not choose for them. Done SHALL be refused until someone other than the organiser has claimed an item.

#### Scenario: Everything claimed

- **WHEN** every item is claimed and the organiser taps Done
- **THEN** the claim message is closed and the bot asks for the description

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
