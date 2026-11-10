## Context

`handleText` already returns early unless the chat has a split owned by the sender. For a step with no typed field it then replies "Please tap one of the buttons above (or /cancel)." (or the summary variant at the confirmation step). In a group the organiser's messages are mostly addressed to other people, so the reply is noise, and it came twice in the reported chat.

## Decisions

**Stay silent in groups only.** In the branch that sends the hint, check `isGroup(ctx)` first and return without replying. Private chats keep the hint because the bot is the only listener. The branch is reached only for steps without a typed field (and the confirmation step), so typed steps, edits and commands are untouched.

**All button-only steps, not just claiming.** The same reply fires at every one of them; fixing only the claim step would leave the same behaviour at the review and the summary. This also keeps one rule: in a group, the bot answers the organiser's text only when it is an answer.

**No state or stats change from this path.** An ignored message writes no answer. Reading the state still refreshes the idle timer exactly as it does today, so a talkative organiser keeps the conversation open a little longer; that is harmless and left as is.

## Risks

- An organiser who really did mean to answer by typing at a button step gets no hint in a group. The buttons are on the message above, and `/cancel` still works. Accepted.
