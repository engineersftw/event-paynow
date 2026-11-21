## ADDED Requirements

### Requirement: `/split_even` is the even-split command and `/split` is gone

The system SHALL offer `/split_even` to start an even split and SHALL NOT treat `/split` as a command any more: the bot SHALL NOT answer it. The help text and the BotFather command list SHALL name `/split_even`, `/split_custom` and `/split_receipt`.

#### Scenario: Old command

- **WHEN** a user sends `/split`
- **THEN** the bot does not start a split

#### Scenario: Help lists the three commands

- **WHEN** a user sends `/help`
- **THEN** the reply names `/split_even`, `/split_custom` and `/split_receipt` and not `/split`

### Requirement: `/start` in a private chat shows the commands

The system SHALL answer `/start` in a private chat with the help text listing the three ways to start a split, and SHALL NOT start a split. In a group, `/start` SHALL stay unanswered as before.

#### Scenario: First open

- **WHEN** a user opens the bot and Telegram sends `/start`
- **THEN** the bot replies with the help text and no question

#### Scenario: Group

- **WHEN** `/start` is sent in a group
- **THEN** the bot does not answer

## MODIFIED Requirements

### Requirement: The bot asks for the bill, the number of people, the payee and a description

The system SHALL, when a user sends `/split_even` to Split_PayNow_Bot, ask in order for the payee (a Singapore mobile number or a UEN), the bill total in SGD, an optional short description, and then the number of people, without asking whether to split equally or with custom amounts. `/split_custom` SHALL ask the same first three questions and then the list of names and amounts. The payee, the total and the split details are required. The description SHALL offer a Skip button and SHALL be at most 25 characters. The bot SHALL work in private chats and in group chats.

#### Scenario: Full conversation in a private chat

- **WHEN** the user sends `/split_even`, a valid payee and the total `187.40`, sends the description `Dinner`, sends the number `4`, and then confirms
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

- **WHEN** the user sends `/split_custom`, a valid payee, the total `100`, taps Skip on the description, sends the lines `Ann 60` and `Bob 40`, and then confirms
- **THEN** the bot replies with PayNow QR images for the amounts listed

### Requirement: A group's member count is offered as the number of people

The system SHALL, when `/split_even` runs in a group chat, read the group's member count from Telegram, subtract one for the bot itself, and offer the result as a button on the number-of-people question when it is at least 2. Tapping the button SHALL use that number. The user SHALL always be able to type a different number instead. In a private chat no button is offered.

#### Scenario: Group with six members

- **WHEN** `/split_even` runs in a group that has the bot and 6 other members
- **THEN** the number-of-people question has a button "Split by 6"

#### Scenario: Typing another number

- **WHEN** the user types `4` instead of tapping the button
- **THEN** the bill is split by 4

#### Scenario: Member count unavailable

- **WHEN** Telegram does not return a member count, or it is below 2
- **THEN** no button is offered and the user types the number

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
- **THEN** nothing is generated, the conversation is cleared and the user is told to send `/split_even` or `/split_custom` to begin again

#### Scenario: Amend button present

- **WHEN** the summary is shown
- **THEN** it has Confirm, Amend and Cancel buttons

### Requirement: The QR is for one share and never shows the payee number

The system SHALL send a PayNow QR as a fixed amount that the payer cannot change, with the description when one was given. For an equal split it SHALL send one QR for the share. For a custom or receipt split it SHALL post in the chat where the split is confirmed one QR for each distinct amount owed, the organiser's own amount included, and each QR's image and caption SHALL name the people who owe that amount. No QR SHALL be sent by direct message. The image and caption SHALL show the description, the amount and, for an equal split, the number of people, and SHALL NOT show the payee number or name. The caption SHALL remind payers to check the payee name in their banking app.

#### Scenario: QR contents

- **WHEN** a bill of 187.40 split by 4 is confirmed with the description `Dinner`
- **THEN** the QR encodes an amount of SGD 46.85 that is not editable and the description `Dinner`, and the caption does not contain the payee number

#### Scenario: QR could not be made

- **WHEN** the QR cannot be generated
- **THEN** the bot says so and asks the user to send `/split_even` or `/split_custom` again, without logging the answers

#### Scenario: One QR per distinct amount

- **WHEN** a custom split of Ann 40, Bob 25, Cy 25 is confirmed
- **THEN** the bot sends two QRs: SGD 40.00 labelled Ann, and SGD 25.00 labelled Bob and Cy

#### Scenario: The organiser is named too

- **WHEN** a custom split of Ann 40 and Bob 25 is confirmed and the organiser's own amount is 25.00
- **THEN** the bot posts two QRs: SGD 40.00 labelled Ann, and SGD 25.00 labelled Bob and the organiser's first name

#### Scenario: A send fails part way

- **WHEN** Telegram refuses one of several QR sends
- **THEN** the other QRs are still sent, the refused one is tried again, and if it still cannot be sent the chat is told which QR is missing and asked to send `/split_even` or `/split_custom` again

### Requirement: In a group only the person who started the split can answer

The system SHALL, in a group chat, accept text and button taps for a split only from the user who started the split (with `/split_even`, `/split_custom` or `/split_receipt`) and only in the same topic, except that any member MAY tap the item buttons of the claim message. Messages from anyone else SHALL be ignored without a reply, and a button tap from someone else, other than a claim tap, is answered with a short "not your split" notice. The bot SHALL try to delete the owner's payee message from the group once it has read it, and a failure to delete SHALL NOT stop the conversation.

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

### Requirement: A button of a split that is no longer open says so and stops being tappable

The system SHALL, when a button of a split is tapped and no split is open in that chat (it timed out, was cancelled or already finished), answer with a popup that stays until it is dismissed, saying that the split is no longer open, how long a waiting split is kept and to send `/split_even` or `/split_custom` to start a new one, and SHALL remove the buttons from the message that was tapped. A button of a split that is still open but has moved on SHALL keep the short notice that the step is over.

#### Scenario: Tap after the time ran out

- **WHEN** the organiser taps Confirm on a summary 40 minutes after their last answer
- **THEN** a popup says the split is no longer open and to send `/split_even` or `/split_custom`, the buttons disappear from that message, and nothing is created

#### Scenario: Tap after the split finished

- **WHEN** someone taps a button of a split that was already confirmed or cancelled
- **THEN** they get the same popup, and nothing changes

#### Scenario: A member taps an expired claim message

- **WHEN** a member taps an item on a claim message whose claiming timed out
- **THEN** they get the popup and the buttons disappear from the message

#### Scenario: Still open at another step

- **WHEN** someone taps a button of an earlier step while the split is open at a later one
- **THEN** they get the short notice that the step is over, and the buttons stay

### Requirement: A typed answer in a private chat with no split open gets a hint

The system SHALL, when a user sends text in a private chat that is not a command and no split is open, reply once that no split is open, to send `/split_even` or `/split_custom` to start one, and how long a waiting split is kept. In a group the system SHALL stay silent, as for any other chatter.

#### Scenario: Answer after the time ran out

- **WHEN** a user types the bill total in a private chat 40 minutes after the bot asked for it
- **THEN** the bot replies that no split is open and to send `/split_even` or `/split_custom`

#### Scenario: Chatter in a group

- **WHEN** someone sends ordinary text in a group where no split is open
- **THEN** the bot sends no reply

#### Scenario: A split is open

- **WHEN** a user sends text in a private chat while a split is open
- **THEN** it is read as the answer to the current question, as before

### Requirement: The payee is asked first in every split

The system SHALL, in every split that is started with `/split_even`, `/split_custom` or `/split_receipt`, ask for the payee before anything about the bill, and SHALL keep the same order when the answers are amended: a payee changed later is checked first, then the rest of the split continues from where it was. The description SHALL be asked as soon as the bill total is known (typed, or accepted from the receipt scan) and before the people, the list, the assignment or the claiming.

#### Scenario: Payee before total

- **WHEN** the user sends `/split_even`
- **THEN** the first question is who should be paid, then the bill total

#### Scenario: Payee before the photo

- **WHEN** the user sends `/split_receipt`
- **THEN** the bot asks for the payee before it asks for the receipt photo

#### Scenario: Changing the payee later

- **WHEN** the user amends the payee on the summary
- **THEN** the bot asks for the new payee and then shows the summary again

### Requirement: QR sends are retried and failures reported

The system SHALL retry a QR that could not be posted: when Telegram asks the bot to slow down it SHALL wait the time Telegram gives, and after another temporary error it SHALL try again after a short delay, up to 5 attempts in all. When Telegram refuses the QR for good (for example the bot was removed from the chat), or the attempts run out, the system SHALL stop trying and, where it still can, post one message in the chat naming the amount and the people whose QR was not sent and asking the user to send `/split_even` or `/split_custom` again.

#### Scenario: Slowed down by Telegram

- **WHEN** Telegram answers a QR send with "too many requests, retry after 7 seconds"
- **THEN** the QR is posted again after about 7 seconds and the chat receives it once

#### Scenario: Gives up

- **WHEN** a QR still cannot be posted after 5 attempts
- **THEN** the chat is told which QR (amount and names) was not sent, and no further attempts are made

#### Scenario: Removed from the chat

- **WHEN** the bot was removed from the group after the split was confirmed
- **THEN** the QR is not retried and nothing else is attempted for it

### Requirement: `/split_custom` starts a custom split directly

The system SHALL accept `/split_custom`, which asks for the payee, then the bill total, then the optional description, and then goes straight to the custom list. It SHALL work in private chats and in groups, with the same owner-only rules in groups.

#### Scenario: Shortcut skips the choice

- **WHEN** the user sends `/split_custom`, a valid payee, a valid total, and answers or skips the description
- **THEN** the bot asks for the list of names and amounts, with no question about the split type

#### Scenario: Invalid total

- **WHEN** the total after `/split_custom` and the payee is not a positive amount with at most two decimals
- **THEN** the bot explains the format and asks for the total again

#### Scenario: Restarting replaces a split in progress

- **WHEN** the owner sends `/split_custom` while a split of theirs is waiting for an answer
- **THEN** the earlier answers are discarded and the bot asks for the payee again

### Requirement: The summary can be amended

The system SHALL show an Amend button on the summary, next to Confirm and Cancel. Tapping it SHALL offer Total, Split, Payee, Description and Back. Choosing a field SHALL ask only that question, with a Keep as is button, and then show the updated summary. Choosing Split SHALL ask again for the details of the same kind of split: the number of people for an even split, the list for a custom split. It SHALL NOT offer a switch between even and custom; the user starts the other command instead. Back SHALL return to the summary unchanged. Amending SHALL NOT generate any QR.

#### Scenario: Change the total

- **WHEN** the user taps Amend, then Total, and sends a new valid total
- **THEN** the bot shows an updated summary with the new total and the other answers unchanged

#### Scenario: Keep as is

- **WHEN** the user taps Amend, chooses Payee and taps Keep as is
- **THEN** the bot shows the summary again with the payee unchanged

#### Scenario: Change the split type

- **WHEN** the user of an even split taps Amend and then Split
- **THEN** the bot asks for the number of people again and offers no switch to custom amounts

#### Scenario: Back

- **WHEN** the user taps Amend and then Back
- **THEN** the summary is shown again with its three buttons

## REMOVED Requirements

### Requirement: The user chooses between an equal and a custom split

**Reason**: `/split_even` and `/split_custom` each start one kind of split, so the question is no longer asked.
**Migration**: Use `/split_even` for an equal split and `/split_custom` for custom amounts.
