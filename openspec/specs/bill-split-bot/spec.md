# bill-split-bot Specification

## Purpose

A standalone Telegram bot that splits a bill equally between a number of people and sends a PayNow QR code for one person's share. It keeps no record of the bill.

## Requirements

### Requirement: The bot asks for the bill, the number of people, the payee and a description

The system SHALL, when a user sends `/split` to Split_PayNow_Bot (or `/start` in a private chat), ask in order for the bill total in SGD, whether to split Equally or with Custom amounts, then either the number of people (equal split) or the list of names and amounts (custom split), then the payee (a Singapore mobile number or a UEN) and an optional short description. The total, the split details and the payee are required. The description SHALL offer a Skip button and SHALL be at most 25 characters. The bot SHALL work in private chats and in group chats.

#### Scenario: Full conversation in a private chat

- **WHEN** the user sends `/split`, the total `187.40`, taps Equally, sends the number `4`, a valid payee and the description `Dinner`, and then confirms
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

- **WHEN** the user sends `/split`, the total `100`, taps Custom amounts, sends the lines `Ann 60` and `Bob 40`, a valid payee and taps Skip, and then confirms
- **THEN** the bot replies with PayNow QR images for the amounts listed

### Requirement: A group's member count is offered as the number of people

The system SHALL, when `/split` runs in a group chat, read the group's member count from Telegram, subtract one for the bot itself, and offer the result as a button on the number-of-people question when it is at least 2. Tapping the button SHALL use that number. The user SHALL always be able to type a different number instead. In a private chat no button is offered.

#### Scenario: Group with six members

- **WHEN** `/split` runs in a group that has the bot and 6 other members
- **THEN** the number-of-people question has a button "Split by 6"

#### Scenario: Typing another number

- **WHEN** the user types `4` instead of tapping the button
- **THEN** the bill is split by 4

#### Scenario: Member count unavailable

- **WHEN** Telegram does not return a member count, or it is below 2
- **THEN** no button is offered and the user types the number

### Requirement: Each person's share is rounded up to the next cent

The system SHALL compute one share as the total in cents divided by the number of people, rounded up to a whole cent, using integer arithmetic. The summary SHALL show the total, the number of people, the share, and, when the shares add up to more than the total, the amount over-collected.

#### Scenario: Even division

- **WHEN** the total is 120.00 and 4 people share it
- **THEN** the share is SGD 30.00 and no over-collection is shown

#### Scenario: Division with a remainder

- **WHEN** the total is 100.00 and 3 people share it
- **THEN** the share is SGD 33.34 and the summary shows that the shares add up to SGD 100.02, which is SGD 0.02 over

### Requirement: The bot confirms before it generates the QR

The system SHALL, after the last question, show one summary with Confirm, Amend and Cancel buttons, and SHALL NOT generate any QR until the user confirms. For a custom split the summary SHALL list each person with the amount they owe, say how a leftover was handled, and show any amount collected above the bill because of rounding. In a private chat the summary shows the payee type and number. In a group chat the summary SHALL show only the payee type and the last four characters of the payee, never the full number.

#### Scenario: Summary in a private chat

- **WHEN** the user has answered every question in a private chat
- **THEN** the bot shows the payee, total, number of people, share and description, and no QR has been sent yet

#### Scenario: Summary in a group

- **WHEN** the user has answered every question in a group chat
- **THEN** the summary hides all but the last four characters of the payee

#### Scenario: Custom summary

- **WHEN** the user has answered every question of a custom split with a leftover left out
- **THEN** the summary lists each person's amount, says the leftover is left out and who covers it, and no QR has been sent yet

#### Scenario: Confirm

- **WHEN** the user taps Confirm
- **THEN** the buttons are removed from the summary and the QR is sent exactly once, even if the button is tapped twice

#### Scenario: Cancel

- **WHEN** the user taps Cancel
- **THEN** nothing is generated, the conversation is cleared and the user is told to send `/split` to begin again

#### Scenario: Amend button present

- **WHEN** the summary is shown
- **THEN** it has Confirm, Amend and Cancel buttons

### Requirement: The QR is for one share and never shows the payee number

The system SHALL send a PayNow QR as a fixed amount that the payer cannot change, with the description when one was given. For an equal split it SHALL send one QR for the share. For a custom split it SHALL send one QR for each distinct amount owed, and each QR's image and caption SHALL name the people who owe that amount. The image and caption SHALL show the description, the amount and, for an equal split, the number of people, and SHALL NOT show the payee number or name. The caption SHALL remind payers to check the payee name in their banking app.

#### Scenario: QR contents

- **WHEN** a bill of 187.40 split by 4 is confirmed with the description `Dinner`
- **THEN** the QR encodes an amount of SGD 46.85 that is not editable and the description `Dinner`, and the caption does not contain the payee number

#### Scenario: QR could not be made

- **WHEN** the QR cannot be generated
- **THEN** the bot says so and asks the user to send `/split` again, without logging the answers

#### Scenario: One QR per distinct amount

- **WHEN** a custom split of Ann 40, Bob 25, Cy 25 is confirmed
- **THEN** the bot sends two QRs: SGD 40.00 labelled Ann, and SGD 25.00 labelled Bob and Cy

#### Scenario: A send fails part way

- **WHEN** Telegram refuses one of several QR sends
- **THEN** the bot stops, says how many QRs were sent and how many were not, and asks the user to send `/split` again

### Requirement: In a group only the person who started the split can answer

The system SHALL, in a group chat, accept text and button taps for a split only from the user who sent `/split` and only in the same topic. Messages from anyone else SHALL be ignored without a reply, except that a button tap from someone else is answered with a short "not your split" notice. The bot SHALL try to delete the owner's payee message from the group once it has read it, and a failure to delete SHALL NOT stop the conversation.

#### Scenario: Another member replies

- **WHEN** a different group member types a number while a split is waiting for an answer from the owner
- **THEN** the bot ignores it and the split continues unchanged

#### Scenario: Another member taps a button

- **WHEN** a different group member taps Confirm on the summary
- **THEN** nothing is generated and the member sees a notice that the split is not theirs

#### Scenario: Payee message removed

- **WHEN** the owner types the payee in a group where the bot may delete messages
- **THEN** the bot deletes that message

#### Scenario: Cannot delete

- **WHEN** the bot may not delete messages in the group
- **THEN** the conversation continues normally

### Requirement: The bot stores nothing and is off until configured

The system SHALL keep a split's answers only in the chat's Durable Object until the QR is sent, the user cancels or the conversation expires after 10 minutes, and SHALL NOT log the bill, payee, description or identities. The only data it keeps beyond that is the contact record (username and user id, until `/forget`) and a waiting QR (until collected or 48 hours). The bot's webhook SHALL answer 404 until its token, webhook secret and username are configured, and SHALL reject a request with a wrong secret token.

#### Scenario: Not configured

- **WHEN** a request reaches `/webhook/split` and the bot's token or webhook secret is not set
- **THEN** the route answers 404

#### Scenario: Wrong secret

- **WHEN** a request to `/webhook/split` carries a wrong `X-Telegram-Bot-Api-Secret-Token`
- **THEN** the route answers 403 and does not run the bot

#### Scenario: Conversation expires

- **WHEN** a split has been idle for 10 minutes
- **THEN** its answers are discarded and a later reply is ignored

#### Scenario: Nothing kept for an equal split

- **WHEN** an equal split or a custom split with no mentions is confirmed
- **THEN** no contact record or waiting QR is written

### Requirement: Questions in a group are asked as replies

The system SHALL, in a group chat, ask each text question as a force-reply prompt aimed at the owner, so that the owner's answer reaches the bot while group privacy mode is on. The bot SHALL NOT require group privacy mode to be turned off.

#### Scenario: Owner answers a prompt

- **WHEN** the owner replies to the bot's total question in a group where privacy mode is on
- **THEN** the bot receives the answer and asks the next question

### Requirement: The user chooses between an equal and a custom split

The system SHALL, after the bill total is accepted, ask whether to split the bill Equally or with Custom amounts, using two buttons. Choosing Equally SHALL continue with the number-of-people question exactly as before. Choosing Custom amounts SHALL continue with the list of people and amounts.

#### Scenario: Choosing equal

- **WHEN** the user taps Equally
- **THEN** the bot asks how many people share the bill

#### Scenario: Choosing custom

- **WHEN** the user taps Custom amounts
- **THEN** the bot asks for a list with one person per line as a name followed by an amount

### Requirement: `/split_custom` starts a custom split directly

The system SHALL accept `/split_custom` as a shortcut that asks for the bill total and then goes straight to the custom list, without asking Equally or Custom amounts. After that it SHALL behave exactly as a custom split started from `/split`, in private chats and in groups, with the same owner-only rules in groups.

#### Scenario: Shortcut skips the choice

- **WHEN** the user sends `/split_custom` and then a valid total
- **THEN** the bot asks for the list of names and amounts and does not offer Equally or Custom amounts

#### Scenario: Invalid total

- **WHEN** the total after `/split_custom` is not a positive amount with at most two decimals
- **THEN** the bot explains the format and asks for the total again

#### Scenario: Restarting replaces a split in progress

- **WHEN** the owner sends `/split_custom` while a split of theirs is waiting for an answer
- **THEN** the earlier answers are discarded and the bot asks for the total again

### Requirement: A custom split takes a list of names and amounts

The system SHALL accept the custom list as one message with one person per line, each line a name or a mention followed by an amount in SGD (for example `Ann 40` or `@ann 40`), for 1 to 20 people who pay the organiser. The organiser is not listed. If any line is invalid, the system SHALL name the first bad line and ask for the whole list again.

#### Scenario: Valid list

- **WHEN** the bill is 100.00 and the user sends the lines `Ann 40` and `Bob 25.50`
- **THEN** the bot accepts the list of two people

#### Scenario: Bad line

- **WHEN** a line has no amount, a plain name longer than 20 characters, no name, or an amount that is zero, negative or has more than two decimals
- **THEN** the bot names that line, explains the format and asks for the list again

#### Scenario: Duplicate name

- **WHEN** the list contains `Ann 10` and `ann 20`
- **THEN** the bot rejects the list because the name is repeated

#### Scenario: Too many people

- **WHEN** the list has more than 20 lines
- **THEN** the bot says the limit is 20 people and asks again

### Requirement: The custom list is checked against the bill total

The system SHALL compare the sum of the listed amounts with the bill total. A sum above the total SHALL be rejected, telling the user by how much it is over, and the list asked for again. A sum equal to the total SHALL continue to the payee question. A sum below the total SHALL ask what to do with the leftover, with two buttons: Split it evenly between the people listed, or Leave it out.

#### Scenario: Over the bill

- **WHEN** the bill is 100.00 and the list adds up to 110.00
- **THEN** the bot says the list is SGD 10.00 over the bill and asks for the list again

#### Scenario: Exactly the bill

- **WHEN** the bill is 100.00 and the list adds up to 100.00
- **THEN** the bot does not ask about a leftover and asks for the payee

#### Scenario: Leftover left out

- **WHEN** the bill is 100.00, the list adds up to 80.00 and the user taps Leave it out
- **THEN** every person keeps the amount listed and the organiser covers SGD 20.00

#### Scenario: Leftover split evenly

- **WHEN** the bill is 100.00, the list is `Ann 40` and `Bob 40`, and the user taps Split it evenly
- **THEN** each of the two people owes SGD 10.00 more, so Ann and Bob each owe SGD 50.00

#### Scenario: Leftover split evenly with rounding

- **WHEN** the leftover is SGD 10.00 and 3 people are listed
- **THEN** each person is charged SGD 3.34 of it, and the summary shows that the amounts add up to SGD 0.02 more than the bill

### Requirement: The summary can be amended

The system SHALL show an Amend button on the summary, next to Confirm and Cancel. Tapping it SHALL offer Total, Split, Payee, Description and Back. Choosing a field SHALL ask only that question, with a Keep as is button, and then show the updated summary. Choosing Split SHALL ask again for equal or custom and the details that go with the choice. Back SHALL return to the summary unchanged. Amending SHALL NOT generate any QR.

#### Scenario: Change the total

- **WHEN** the user taps Amend, then Total, and sends a new valid total
- **THEN** the bot shows an updated summary with the new total and the other answers unchanged

#### Scenario: Keep as is

- **WHEN** the user taps Amend, chooses Payee and taps Keep as is
- **THEN** the bot shows the summary again with the payee unchanged

#### Scenario: Change the split type

- **WHEN** the user amends Split and chooses Custom amounts instead of Equally and sends a valid list
- **THEN** the summary shows the custom amounts and no longer shows the equal share

#### Scenario: Back

- **WHEN** the user taps Amend and then Back
- **THEN** the summary is shown again with its three buttons

### Requirement: An amendment that breaks another answer asks for that answer again

The system SHALL, after any change, check every answer against the others and ask only for what is now missing or invalid, before showing the summary. A custom list that adds up to more than the new total SHALL be asked for again. A custom list that now falls short of the total SHALL ask what to do with the leftover if no choice was made. A number of people larger than the cents in the new total SHALL be asked for again.

#### Scenario: Total drops below the list

- **WHEN** a custom list adds up to 100.00 and the user amends the total to 80.00
- **THEN** the bot says the list is SGD 20.00 over the new total and asks for the list again

#### Scenario: Total leaves a gap

- **WHEN** a custom list adds up to 100.00 with no leftover choice and the user amends the total to 120.00
- **THEN** the bot asks what to do with the SGD 20.00 leftover

#### Scenario: Leftover choice already made

- **WHEN** a custom list with the leftover split evenly has its total raised
- **THEN** the earlier choice is kept and the summary shows the new even amounts

### Requirement: Editing a sent answer amends it

The system SHALL, when the owner edits the text of a message that answered the total, the number of people, the custom list, the payee or the description, read the new text and apply the same checks as for a new answer. When the split is waiting at the summary it SHALL show an updated summary; otherwise it SHALL ask for what is now needed. An invalid edit SHALL be refused with the reason and the earlier value kept.

#### Scenario: Edit the total at the summary

- **WHEN** the summary is shown and the user edits their total message from `100` to `120`
- **THEN** the bot shows a new summary based on 120.00

#### Scenario: Edit an earlier answer while a later question is open

- **WHEN** the bot is asking for the payee and the user edits their total message to a valid new total
- **THEN** the bot confirms the update and keeps waiting for the payee, without repeating the question

#### Scenario: Invalid edit

- **WHEN** the user edits their total message to `abc`
- **THEN** the bot says the edit is not a valid amount and keeps the earlier total

### Requirement: Edits that do not apply are ignored

The system SHALL ignore, without a reply, edits of messages that are not recorded answers of the active split, edits from anyone but the owner in a group, and edits after the QR was sent or the split ended. An edited payee message in a group SHALL be removed like the original.

#### Scenario: Edit after the QR was sent

- **WHEN** the user edits an answer after confirming
- **THEN** nothing happens

#### Scenario: Another member edits

- **WHEN** a different group member edits a message of theirs
- **THEN** the bot ignores it

#### Scenario: Edited payee in a group

- **WHEN** the owner edits their payee message in a group where the bot may delete messages
- **THEN** the bot deletes the edited message and uses the new payee

### Requirement: Only one summary can be confirmed

The system SHALL, whenever a new summary replaces an earlier one, remove the buttons from the earlier summary, so that only the latest summary can be confirmed. A tap on a button of an earlier summary SHALL be answered with a short notice and change nothing.

#### Scenario: Old summary is replaced

- **WHEN** the user amends the total and a new summary is shown
- **THEN** the first summary no longer has buttons

#### Scenario: Tap on a stale button

- **WHEN** the user taps Confirm on a summary that has been replaced
- **THEN** no QR is sent and the user is told that step is over

### Requirement: A custom list can mention payers

The system SHALL accept, in place of a name in a custom list, an @username (for example `@ann 40`) or a Telegram mention chosen from the member list. A list MAY mix mentions and plain names. A mention counts as the person's name, is unique ignoring case like any name, and SHALL NOT be subject to the 20-character name limit.

#### Scenario: Username mention

- **WHEN** the user sends the lines `@ann 40` and `Bob 25`
- **THEN** the bot accepts a list of two people, the first identified by the username ann

#### Scenario: Mention chosen from the member list

- **WHEN** the user picks a member without a username from Telegram's mention list and gives an amount
- **THEN** the bot accepts the line and identifies the person by their Telegram id

#### Scenario: Same person twice

- **WHEN** the list contains `@Ann 10` and `@ann 20`
- **THEN** the bot rejects the list because the name is repeated

### Requirement: Mentioned people receive their QR by direct message

The system SHALL, when the user confirms a custom split, send each mentioned person who can be messaged a PayNow QR for their own amount as a direct message from the bot. The message SHALL name the organiser, the amount and the description, and SHALL NOT show the payee number. Plain-name people SHALL still be served by one chat QR per distinct amount, and a QR SHALL NOT be sent to the chat for a mentioned person.

#### Scenario: All mentioned and known

- **WHEN** a split of `@ann 40` and `@bob 25` is confirmed and the bot knows both
- **THEN** Ann and Bob each receive a direct message with their own QR and no QR is posted in the chat

#### Scenario: Mixed list

- **WHEN** a split of `@ann 40` and `Cy 25` is confirmed
- **THEN** Ann receives a direct message and the chat receives one QR labelled Cy

#### Scenario: Result report

- **WHEN** the direct messages have been sent
- **THEN** the chat shows which mentioned people were sent their QR and which are waiting

### Requirement: People the bot cannot message get a Get my QR button

The system SHALL, for each mentioned person who cannot be messaged (unknown to the bot, or the message is refused), post one waiting message in the chat with a Get my QR button for each such person. The button SHALL open the bot's private chat. After the person starts the bot there, the bot SHALL check that they are the person mentioned (same Telegram id, or same username ignoring case) and send their QR by direct message. The QR SHALL NOT be posted in the chat.

#### Scenario: Unknown person

- **WHEN** a split names `@dee`, whom the bot does not know, and is confirmed
- **THEN** the chat shows a waiting message with a Get my QR button for Dee

#### Scenario: Dee collects

- **WHEN** Dee taps the button and starts the bot
- **THEN** Dee receives the QR by direct message and the waiting message no longer lists Dee

#### Scenario: Someone else taps

- **WHEN** a different user opens the bot through Dee's button
- **THEN** the bot says the QR is for someone else and sends nothing

### Requirement: Waiting QRs expire and are used once

The system SHALL keep a waiting QR only until it is collected or 48 hours after the split was confirmed, whichever comes first, and SHALL send each waiting QR at most once. An expired or already collected request SHALL be answered with a short notice and no QR.

#### Scenario: Collected twice

- **WHEN** the same person opens their button a second time
- **THEN** the bot says the request is already collected and sends nothing

#### Scenario: Expired

- **WHEN** a person opens a button 49 hours after the split
- **THEN** the bot says the request has expired and sends nothing

### Requirement: The bot remembers who has started it, and can forget them

The system SHALL record a person's Telegram username and user id when they send `/start` to the bot in a private chat, replacing any earlier record for that username or that user. A person with no username SHALL NOT be recorded. `/forget` in a private chat SHALL delete the person's record and reply that it is gone.

#### Scenario: Recorded on start

- **WHEN** a user with the username ann sends `/start` to the bot in a private chat
- **THEN** a later split that mentions @ann can send Ann a direct message

#### Scenario: Username changes hands

- **WHEN** a different user with the username ann sends `/start`
- **THEN** the record for ann now holds the new user's id

#### Scenario: Forget

- **WHEN** the user sends `/forget`
- **THEN** their record is deleted and mentions of them are treated as unknown

### Requirement: A receipt photo is read for the bill

The system SHALL accept `/split_receipt`, which asks for a photo of the receipt, and SHALL also accept a photo when the bot is asking for the bill total. It SHALL read the photo with a vision model and extract the line items with prices, the service charge, GST, any discount and the total, in SGD. If the photo is unreadable, has no total, or the reader is unavailable, the bot SHALL say so and offer to type the total instead.

#### Scenario: Photo after /split_receipt

- **WHEN** the user sends `/split_receipt` and then a clear receipt photo
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

### Requirement: Items are assigned to people in one message

The system SHALL ask who had each item and accept one message with lines of item numbers followed by people, for example `1,3 Ann`, `2 Ann, Bob`, `4 me`, `5 all`. A person can be a name or an @mention. `me` is the organiser and `all` is everyone named in the message. An item given to several people is shared equally between them. An item SHALL NOT be assigned more than once, the item numbers SHALL exist, and every line SHALL name people; a bad line SHALL be named with the whole message asked for again. Items that appear in no line are unassigned and are handled by the organiser's choice.

#### Scenario: Valid assignment

- **WHEN** the receipt has 5 items and the user sends `1,3 Ann`, `2 Ann, Bob`, `4 me` and `5 all`
- **THEN** the bot accepts the assignment

#### Scenario: Unassigned item

- **WHEN** item 4 appears in no line
- **THEN** the bot accepts the message and asks what to do with item 4

#### Scenario: Item assigned twice

- **WHEN** item 2 appears in two lines
- **THEN** the bot rejects the message and names item 2

#### Scenario: Unknown item number

- **WHEN** a line names item 9 on a receipt with 5 items
- **THEN** the bot rejects the message and names item 9

#### Scenario: Only the organiser named

- **WHEN** the message names only `me`
- **THEN** the bot says nobody else owes anything and asks for the message again

### Requirement: Charges are shared in proportion and the amounts add up to the receipt

The system SHALL compute each person's amount as their share of the items plus a share of the difference between the receipt total and the sum of the items (service charge, GST, rounding, and any discount as a negative amount), in proportion to each person's item share, with cents allocated so that all amounts, including the organiser's, add up exactly to the receipt total. The organiser's own amount SHALL be shown but not collected.

#### Scenario: Pro-rata charges

- **WHEN** Ann's items come to 30.00 and Bob's to 10.00, and the receipt total is 48.00 after 8.00 of charges
- **THEN** Ann owes 36.00 and Bob owes 12.00

#### Scenario: Shared item

- **WHEN** a 9.00 item is shared by three people
- **THEN** each person's item share is 3.00 and any odd cent goes to the first people listed

#### Scenario: Organiser's share

- **WHEN** the organiser (`me`) had items worth 20.00 of a 60.00 receipt
- **THEN** the summary shows the organiser covering their share and only the others are asked to pay

### Requirement: The receipt split continues as a custom split

The system SHALL, once items are assigned, continue as a custom split with the computed amounts: the payee question, the optional description, the summary with Confirm, Amend and Cancel, one QR per distinct amount, and direct messages to mentioned people. Amend SHALL offer Items, which asks for the assignment again, and editing the assignment message SHALL update the split like any other edited answer.

#### Scenario: Full receipt flow

- **WHEN** the user scans a receipt, taps Use this, assigns items to `@ann` and `Bob`, gives a payee and confirms
- **THEN** Ann is sent her QR by direct message and the chat receives a QR for Bob

#### Scenario: Amend items

- **WHEN** the user taps Amend, then Items, and sends a new assignment
- **THEN** the summary shows the new amounts

### Requirement: Receipt photos are not kept

The system SHALL process a receipt photo in memory, SHALL NOT store the photo, and SHALL NOT log its contents. The items, prices and assignment SHALL be kept only in the chat's conversation state, which is discarded when the split ends or after 10 minutes.

#### Scenario: Nothing written

- **WHEN** a receipt split is confirmed
- **THEN** no receipt data remains in the database and the conversation state is cleared

#### Scenario: Conversation expires

- **WHEN** a receipt split has been idle for 10 minutes
- **THEN** the scan result and assignment are discarded

### Requirement: The organiser chooses what happens to unassigned items

The system SHALL, when an assignment leaves some receipt items out, state which items are unassigned and what they cost before charges, and ask the organiser to choose Split evenly or Leave them out. Split evenly SHALL share each unassigned item equally between everyone named in the assignment. Leave them out SHALL assign each unassigned item to the organiser, so it is counted but not collected. The system SHALL NOT choose for the organiser, and SHALL NOT ask when every item is assigned.

#### Scenario: Split evenly

- **WHEN** item 3 (9.00) is unassigned and the message names Ann and Bob, and the organiser chooses Split evenly
- **THEN** Ann and Bob each carry 4.50 of item 3, plus their share of the charges

#### Scenario: Leave them out

- **WHEN** item 3 is unassigned and the organiser chooses Leave them out
- **THEN** item 3 counts as the organiser's, the summary shows the organiser's share, and only the people named are asked to pay

#### Scenario: Everything assigned

- **WHEN** every item appears in the assignment
- **THEN** the bot does not ask about unassigned items

#### Scenario: The question names the items

- **WHEN** items 2 and 5 are unassigned
- **THEN** the question lists items 2 and 5 and their combined price

### Requirement: The unassigned choice is kept while the same items stay unassigned

The system SHALL keep the organiser's choice when an assignment is edited or amended and the same items are still unassigned, and SHALL ask again when a different set of items is unassigned. It SHALL clear the choice when no item is unassigned any more.

#### Scenario: Edit with the same gap

- **WHEN** the organiser edits the assignment message but item 3 is still unassigned
- **THEN** the earlier choice is applied and the summary updates

#### Scenario: A different gap

- **WHEN** an amended assignment leaves item 4 unassigned instead of item 3
- **THEN** the bot asks again what to do with it
