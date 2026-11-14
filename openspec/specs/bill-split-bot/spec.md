# bill-split-bot Specification

## Purpose

A standalone Telegram bot that splits a bill equally between a number of people and sends a PayNow QR code for one person's share. It keeps no record of the bill.

## Requirements

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

- **WHEN** the bot is asking for the total and the user edits their payee message to a valid new payee
- **THEN** the bot confirms the update, asks again whether the new payee is the user, and then keeps waiting for the total

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

### Requirement: Items are assigned to people in one message

The system SHALL ask who had each item and accept one message in either of two formats. The line format has lines of item numbers followed by people, for example `1,3 Ann`, `2 Ann, Bob`, `4 me`, `5 all`. The header format has header lines naming people, each followed by item lines copied from the printed list such as `1. Chefs Pizza SGD 18.80`; a header is a name, an @mention, `me`, `all` or a comma-separated group, with an optional trailing colon, and blank lines are ignored. The format SHALL be detected from the message: a message with any line that is neither an item line (a number then a full stop or bracket) nor a line format line is read as the header format. In the header format an item line is matched by its number only, the rest of the line is ignored, and an item line before the first header is an error. `me` is the organiser and `all` is everyone named in the message. An item given to several people is shared equally between them; in the header format an item listed under several headers is shared by those people. In the line format an item SHALL NOT be assigned more than once. The item numbers SHALL exist, and every header or line SHALL name people; a bad line SHALL be named with the whole message asked for again. Items that appear nowhere are unassigned and are handled by the organiser's choice. The numbered item list SHALL be sent as its own message, just before the assignment prompt, so it can be copied whole, and the prompt SHALL show both formats.

#### Scenario: Valid assignment

- **WHEN** the receipt has 5 items and the user sends `1,3 Ann`, `2 Ann, Bob`, `4 me` and `5 all`
- **THEN** the bot accepts the assignment

#### Scenario: Items in their own message

- **WHEN** the bot asks who had what
- **THEN** it first sends a message holding only the numbered items, then the question

#### Scenario: Pasted list with headers

- **WHEN** the receipt has 4 items and the user sends `Sam`, `1. Chefs Pizza SGD 18.80`, a blank line, `@benjamin`, `2. Clam Chowder SGD 8.80`, a blank line, `All:`, `3. Sirloin Steak SGD 30.80` and `4. Spaghetti SGD 20.80`
- **THEN** item 1 is Sam's, item 2 is Benjamin's and items 3 and 4 are shared by Sam and Benjamin

#### Scenario: Item under two headers

- **WHEN** item 2 is listed under both `Ann` and `Bob` in the header format
- **THEN** item 2 is shared equally by Ann and Bob

#### Scenario: Reworded item line

- **WHEN** a pasted item line is `2. Clam chowder` with no price
- **THEN** it is matched to item 2

#### Scenario: Item line before any header

- **WHEN** the first line of a header format message is `1. Chefs Pizza`
- **THEN** the bot rejects the message, names that line and asks for the whole message again

#### Scenario: Unassigned item

- **WHEN** item 4 appears nowhere in the message
- **THEN** the bot accepts the message and asks what to do with item 4

#### Scenario: Item assigned twice

- **WHEN** item 2 appears in two lines of the line format
- **THEN** the bot rejects the message and names item 2

#### Scenario: Unknown item number

- **WHEN** a line or item line names item 9 on a receipt with 5 items
- **THEN** the bot rejects the message and names item 9

#### Scenario: Only the organiser named

- **WHEN** the message names only `me`
- **THEN** the bot says nobody else owes anything and asks for the message again

### Requirement: Charges are shared in proportion and the amounts add up to the receipt

The system SHALL compute each person's amount as their share of the items plus a share of the difference between the receipt total and the sum of the items (service charge, GST, rounding, and any discount as a negative amount), in proportion to each person's item share, with cents allocated so that all amounts, including the organiser's, add up exactly to the receipt total. The organiser's own amount SHALL be shown, and SHALL be collected only when the payee is someone else.

#### Scenario: Pro-rata charges

- **WHEN** Ann's items come to 30.00 and Bob's to 10.00, and the receipt total is 48.00 after 8.00 of charges
- **THEN** Ann owes 36.00 and Bob owes 12.00

#### Scenario: Shared item

- **WHEN** a 9.00 item is shared by three people
- **THEN** each person's item share is 3.00 and any odd cent goes to the first people listed

#### Scenario: Organiser's share

- **WHEN** the organiser (`me`) had items worth 20.00 of a 60.00 receipt and the payee is the organiser
- **THEN** the summary shows the organiser covering their share and only the others are asked to pay

### Requirement: The receipt split continues as a custom split

The system SHALL, once items are assigned, continue as a custom split with the computed amounts: the optional description (the payee was asked first), the summary with Confirm, Amend and Cancel, one QR per distinct amount, and direct messages to mentioned people. Amend SHALL offer Items, which asks for the assignment again, and editing the assignment message SHALL update the split like any other edited answer.

#### Scenario: Full receipt flow

- **WHEN** the user scans a receipt, taps Use this, assigns items to `@ann` and `Bob` and confirms
- **THEN** Ann is sent her QR by direct message and the chat receives a QR for Bob

#### Scenario: Amend items

- **WHEN** the user taps Amend, then Items, and sends a new assignment
- **THEN** the summary shows the new amounts

### Requirement: Receipt photos are not kept

The system SHALL process a receipt photo in memory, SHALL NOT store the photo, and SHALL NOT log its contents. The items, prices, claims and assignment SHALL be kept only in the chat's conversation state, which is discarded when the split ends, after 10 minutes of inactivity, or after one hour of inactivity while items are being claimed.

#### Scenario: Nothing written

- **WHEN** a receipt split is confirmed
- **THEN** no receipt data remains in the database and the conversation state is cleared

#### Scenario: Conversation expires

- **WHEN** a receipt split has been idle for 10 minutes outside the claiming step
- **THEN** the scan result and assignment are discarded

### Requirement: The organiser chooses what happens to unassigned items

The system SHALL, when an assignment leaves some receipt items out, state which items are unassigned and what they cost before charges, and ask the organiser to choose Split evenly or Leave them out. Split evenly SHALL share each unassigned item equally between everyone named in the assignment. Leave them out SHALL assign each unassigned item to the organiser as part of their own amount. The system SHALL NOT choose for the organiser, and SHALL NOT ask when every item is assigned.

#### Scenario: Split evenly

- **WHEN** item 3 (9.00) is unassigned and the message names Ann and Bob, and the organiser chooses Split evenly
- **THEN** Ann and Bob each carry 4.50 of item 3, plus their share of the charges

#### Scenario: Leave them out

- **WHEN** item 3 is unassigned and the organiser chooses Leave them out
- **THEN** item 3 counts as the organiser's, the summary shows the organiser's share, and only the people named are asked to pay unless the payee is someone else

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

### Requirement: When someone else is paid, the organiser pays their own share

The system SHALL, when the organiser says the payee is someone else, collect the organiser's own amount like everyone else's and send the organiser a QR for it when it is above zero. When the organiser says the payee is them, their own amount SHALL stay shown but not collected, as before.

#### Scenario: Receipt split, someone else paid

- **WHEN** the organiser's items come to 24.00 of a 72.00 receipt, the payee is someone else, and the split is confirmed
- **THEN** the organiser receives a QR for SGD 24.00 and the others receive theirs

#### Scenario: Custom split, someone else paid

- **WHEN** the bill is 100.00, the list adds up to 80.00, the leftover is left out and the payee is someone else
- **THEN** the organiser receives a QR for SGD 20.00

#### Scenario: Payee is the organiser

- **WHEN** the organiser says the payee is them
- **THEN** their own amount is shown as not collected and no QR is made for it

#### Scenario: Nothing to pay

- **WHEN** the payee is someone else and the organiser's own amount is zero
- **THEN** no QR is made for the organiser

### Requirement: The organiser's own amount comes from their items or the left-out remainder

The system SHALL take the organiser's own amount to be their items and any unassigned items they cover in a receipt split, and the leftover that was left out in a custom split. The organiser's QR SHALL be sent by direct message or, when the bot cannot message them, through a Get my QR button, and SHALL NOT be posted in the chat.

#### Scenario: Via direct message

- **WHEN** the organiser has started the bot and the split is confirmed with someone else as the payee
- **THEN** the QR for their own amount arrives as a direct message

#### Scenario: Not reachable

- **WHEN** the organiser has never started the bot
- **THEN** the chat shows a Get my QR button for them and the QR is not posted in the chat

### Requirement: The summary and QR wording follow the answer

The system SHALL word the summary by the answer. When the payee is the organiser it SHALL say the organiser's own share is not collected, or in an equal split that everyone else pays the share to them. When the payee is someone else it SHALL say the organiser pays their own share and gets a QR, or in an equal split that all the people pay the share to the payee.

#### Scenario: Equal split, someone else paid

- **WHEN** a bill of 100.00 is split between 4 people and the payee is someone else
- **THEN** the summary says all 4 people pay SGD 25.00 to the payee

#### Scenario: Equal split, organiser paid

- **WHEN** a bill of 100.00 is split between 4 people and the payee is the organiser
- **THEN** the summary says everyone else pays the organiser SGD 25.00

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

### Requirement: The receipt review is removed once the scan is used

The system SHALL delete the "I read this receipt" message when the user taps **Use this**. The other review buttons SHALL keep their behaviour, so the review stays visible when the user scans again, types the total instead, or adds a missing item.

#### Scenario: Scan used

- **WHEN** the user taps Use this on the review
- **THEN** the review message is deleted and the bot asks who had what

#### Scenario: Scan again

- **WHEN** the user taps Scan again on the review
- **THEN** the review message stays, without its buttons, and the bot asks for another photo

#### Scenario: Message cannot be deleted

- **WHEN** Telegram refuses to delete the review message
- **THEN** its buttons are removed instead and the flow continues

### Requirement: The assignment prompt does not promise an uncollected share

The system SHALL NOT state in the assignment prompt that the organiser's share is not collected, because the payee is only asked afterwards. The prompt SHALL say that `me` is the organiser, that the share is not collected if the organiser is the payee, and that otherwise a QR for it is sent to the organiser.

#### Scenario: Wording

- **WHEN** the bot asks who had what
- **THEN** the text explains `me` and both outcomes, and does not say the share is simply not collected

### Requirement: The summary counts the organiser among the people sharing the bill

The system SHALL, in the custom and receipt summary, count the organiser in "shared by N people" when the summary shows an amount for the organiser: their own share, or a leftover they cover or pay. When the leftover is split evenly between the listed people, or there is no leftover, the count is the number of listed people.

#### Scenario: Organiser has an own share

- **WHEN** a receipt split lists two people and the organiser's own share is SGD 32.13
- **THEN** the summary says the bill is shared by 3 people

#### Scenario: Organiser covers a leftover

- **WHEN** a custom split lists two people and leaves a leftover out for the organiser to cover
- **THEN** the summary says the bill is shared by 3 people

#### Scenario: Exact list

- **WHEN** a custom split lists two people whose amounts add up to the bill
- **THEN** the summary says the bill is shared by 2 people

#### Scenario: Leftover split evenly

- **WHEN** the leftover is split evenly between two listed people
- **THEN** the summary says the bill is shared by 2 people

### Requirement: The review buttons have one row each

The system SHALL lay out the receipt review's buttons one per row so that no label is cut off on a phone: **Add a missing item** when offered, then **Use this**, **Send another photo** and **Type the total instead**. The callback data and behaviour of each button are unchanged.

#### Scenario: Three rows

- **WHEN** the review is shown for a scan that adds up
- **THEN** it has three rows with one button each: Use this, Send another photo, Type the total instead

#### Scenario: Missing item offered

- **WHEN** the review is shown for a scan that looks short
- **THEN** Add a missing item is the first row and the other three follow

### Requirement: The reading notice is removed once the scan is read

The system SHALL delete the "Reading your receipt…" message when the photo has been read and the review is shown. When the scan fails, the message SHALL stay and the failure message SHALL follow it. If the message cannot be deleted, the flow continues.

#### Scenario: Successful scan

- **WHEN** a photo is read successfully
- **THEN** the "Reading your receipt…" message is deleted and the review is shown

#### Scenario: Failed scan

- **WHEN** the photo cannot be read
- **THEN** the "Reading your receipt…" message stays and the bot says it could not read the photo

### Requirement: The colon after a name is optional

The system SHALL accept a name line in the pasted-list format with or without a trailing colon, and `all` in any letter case, so `All`, `All:` and `ALL :` mean the same. The assignment prompt SHALL show the example without a colon and say the colon is optional.

#### Scenario: Without a colon

- **WHEN** the user sends `Sam`, `1. Pizza`, `All`, `2. Steak`
- **THEN** item 2 is shared by everyone named, exactly as with `All:`

### Requirement: In a group the organiser can let members claim the items

The system SHALL, in a group chat after the user taps Use this on a receipt scan, ask whether the organiser will type who had each item or let everyone claim. Choosing to type SHALL continue as before. Choosing to let everyone claim SHALL post one claim message. In a private chat the question SHALL NOT be asked and the organiser types the assignment.

#### Scenario: Choice in a group

- **WHEN** the organiser taps Use this on a scan in a group chat
- **THEN** the bot offers "I'll type it" and "Let everyone claim"

#### Scenario: No choice in a private chat

- **WHEN** the organiser taps Use this on a scan in a private chat
- **THEN** the bot asks who had each item, as before

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

### Requirement: Claims become the same amounts as a typed assignment

The system SHALL compute each claimer's amount exactly as for a typed assignment: each item shared equally between its claimers (an item shared N ways costs each holder one Nth, and unfilled shares are handled as unclaimed items), the difference between the receipt total and the items shared in proportion, and all amounts, including the organiser's, adding up to the receipt total. The split SHALL then continue as a custom split with the claimers as the people to collect from.

#### Scenario: Claimed amounts

- **WHEN** Ann claims a 30.00 item, Bob a 10.00 item, and the receipt total is 48.00
- **THEN** Ann owes 36.00 and Bob owes 12.00

#### Scenario: Item shared three ways

- **WHEN** a 30.00 item is shared 3 ways, Ann and Bob hold a share each, and the organiser covers the unfilled share
- **THEN** Ann and Bob each owe 10.00 for it and the organiser's own share includes the other 10.00

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

### Requirement: The organiser's chat is not answered while the bot waits for taps in a group

The system SHALL, in a group chat, ignore the organiser's free text without any reply while the split is at a step that only takes button taps, and the split SHALL continue unchanged. In a private chat the bot SHALL keep telling the user to tap one of the buttons. Steps that take typed text and commands SHALL be unchanged.

#### Scenario: Organiser talks to the group while members claim

- **WHEN** the organiser sends "@Ann please tap item 3" in a group while the claim message is open
- **THEN** the bot sends no reply and the claims are unchanged

#### Scenario: Other button-only steps in a group

- **WHEN** the organiser sends any text in a group while the bot waits for a button on the review, the summary or a choice
- **THEN** the bot sends no reply

#### Scenario: Private chat keeps the hint

- **WHEN** the user sends text in a private chat while the bot waits for a button
- **THEN** the bot replies that they should tap one of the buttons or send /cancel

#### Scenario: Typed answers still work

- **WHEN** the organiser sends the payee in a group while the bot is asking for it
- **THEN** the answer is read as before

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

### Requirement: A voice note can answer who had which item

While the bot waits for the assignment of a scanned receipt's items, a voice note from the organiser SHALL be read as spoken assignments, turned into the same lines a typed assignment uses, and offered back for confirmation. The bot SHALL show what it heard and, in a separate message, the resulting lines with a **Use these lines** button, and SHALL NOT change the split until that button is tapped.

#### Scenario: Spoken assignment

- **WHEN** the receipt has items 1 Pizza, 2 Beer, 3 Salad and the organiser sends a voice note saying "the pizza and the salad were Ann's, the beer was shared by Ann and Bob"
- **THEN** the bot replies with what it heard and the lines `1,3 Ann` and `2 Ann, Bob` in their own message with a **Use these lines** button, and the assignment is still waiting

#### Scenario: Confirming

- **WHEN** the organiser taps **Use these lines**
- **THEN** the lines are checked and applied exactly as if the organiser had typed them, and the flow continues as after a typed assignment

#### Scenario: Correcting

- **WHEN** the organiser sends another voice note, or types an assignment, instead of tapping the button
- **THEN** the earlier lines are discarded and the new message is handled, and the old button no longer applies anything

#### Scenario: Lines that fail the usual check

- **WHEN** the lines made from a voice note name an item number that does not exist, or the button is tapped after the items changed so that the lines no longer fit
- **THEN** the bot gives the same error a typed message would, applies nothing and keeps asking for the assignment

### Requirement: Voice notes are limited and never kept

The system SHALL refuse a voice note longer than 60 seconds or larger than 1 MB with a message that says so, SHALL hold the audio in memory only for the one request, and SHALL NOT store or log the audio or the heard text. The made lines SHALL live only in the conversation state until used, replaced or the conversation ends.

#### Scenario: Too long

- **WHEN** the organiser sends a voice note of 90 seconds at the assignment step
- **THEN** the bot says voice notes can be at most 60 seconds, applies nothing, and keeps asking for the assignment

#### Scenario: Nothing is kept

- **WHEN** a voice note was heard and the assignment is finished or cancelled
- **THEN** neither the audio nor the heard text remains stored anywhere

### Requirement: A voice note that cannot be used leaves the organiser where they were

When the speech cannot be turned into text, the text cannot be turned into assignment lines, or speech-to-text fails, the bot SHALL say so, show what it heard when there is any, and invite the organiser to send another voice note or type the assignment. The conversation state SHALL stay at the assignment step.

#### Scenario: Nothing heard

- **WHEN** the voice note is silent or the speech-to-text returns no words
- **THEN** the bot says it heard nothing and asks for another voice note or typed text

#### Scenario: Heard but not understood

- **WHEN** the speech is heard but cannot be made into lines
- **THEN** the bot shows what it heard, says it could not turn that into an assignment, and asks for another voice note or typed text

#### Scenario: Speech-to-text is down

- **WHEN** the speech-to-text call fails
- **THEN** the bot says voice is not working right now and asks for typed text

### Requirement: Voice notes are only used for the organiser's assignment

A voice note SHALL be acted on only when the sender owns the split and the conversation is at the assignment step. At every other step, or from anyone else, the bot SHALL NOT change the split; in a private chat it SHALL reply with a short line saying that a voice note is accepted only for the assignment, and in a group it SHALL stay silent. At the assignment step, when speech-to-text is not configured, the bot SHALL say voice is not available and keep asking for typed text.

#### Scenario: Another member in a group

- **WHEN** a member who is not the organiser sends a voice note in the group
- **THEN** the bot does nothing

#### Scenario: Wrong step

- **WHEN** the organiser sends a voice note while the bot waits for the payee or the total
- **THEN** the split does not change, and in a private chat the bot says it takes a typed answer here

#### Scenario: Not configured

- **WHEN** the speech-to-text binding is missing and the organiser sends a voice note at the assignment step
- **THEN** the bot says voice is not available and asks for typed text

### Requirement: The assignment prompt mentions voice

The assignment prompt SHALL say that a voice note works as well as typing, when speech-to-text is configured.

#### Scenario: Prompt

- **WHEN** the bot asks who had which item and speech-to-text is configured
- **THEN** the prompt includes a line that the organiser can also send a voice note
