## Why

Three small rough edges in the Split bot's receipt flow:

- The "I read this receipt:" bubble stays in the chat after the user has confirmed it, cluttering the conversation with a block of items already repeated elsewhere.
- The assignment instructions end with `"me" is you: your share is not collected`. That is only true when the organiser is the payee; the payee is asked after the assignment, and when someone else paid, the organiser is sent a QR for their own share.
- The custom and receipt summary says "Bill: SGD 143.40 shared by 2 people" while an own share for the organiser is listed below it, so the count leaves the organiser out.
- The "Is this payee you?" bubble keeps its Yes / No look after an answer, with no sign of what was chosen.

## What Changes

- Tapping **Use this** on the receipt review deletes the review message (the other review buttons keep their current behaviour: the review stays when the user scans again or types the total).
- The assignment prompt ends with wording that is true either way: your share is not collected if you are the payee, otherwise a QR for it is sent to you.
- The summary's people count includes the organiser whenever the summary shows an amount for them (their own share, or a leftover they cover or pay).
- Answering "Is this payee you?" removes the buttons and rewrites the bubble to state the answer: "Payment was made by you." or "Payment was made by someone else."

No new step, command, table or secret.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: new requirements for the review being removed on confirmation and for the assignment prompt's wording; the payee-question requirement now covers what happens to its bubble.

## Impact

- `src/commands/split-handler.ts`: the `split_scan:use` branch, the `split_payee:*` branch and the assignment prompt text.
- Tests: `test/workers/split-bot.test.ts` (plus the stub harness if it cannot yet see deleted or edited messages).
- Docs: README only if it quotes the prompt wording.
