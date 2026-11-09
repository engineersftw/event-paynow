# Design

## Context

`SimpleCommandHandler` (`src/commands/simple-handler.ts`) runs steps PAYEE(1) → AMOUNT(2) → EDITABLE(3, only with an amount) → DESCRIPTION(4) in the chat's Durable Object (key `simple-<id>`, flow `simple`) and today calls `finish()` straight after DESCRIPTION: it claims the state with `POST /claim {flow, step}` (exactly once, wipes the state) and then builds and sends the QR. Event PayNow Bot's `/start` has the same shape of confirmation (`start_confirm` / `start_cancel`, claim on Confirm, summary text built by one helper).

## Goals / Non-Goals

**Goals:** one confirmation step showing every answer; QR only after Confirm; exactly-once Confirm.

**Non-Goals:** editing individual answers, changing the QR, saving anything.

## Decisions

1. **New step CONFIRM(5).** Answering or skipping the description now stores it (`context.description`, absent when skipped) and moves to CONFIRM instead of calling `finish()`. The description is stored in the state like the other answers, so it is wiped by the same claim.
2. **Summary text** from one helper, plain text (no parse mode, so user text never needs escaping): `Payee: <Mobile|UEN> <number>`, `Amount: SGD x.xx` or `Amount: set by payer`, `Payer can change the amount: Yes|No` only when an amount was given, `Description: <text>|none`. The payee number is shown here on purpose (private chat, it is what the user needs to check); the QR image and caption keep their no-number rule.
3. **Buttons `simple_confirm` and `simple_cancel`**, step-guarded like the existing ones (a stale tap answers "That step is over."). Confirm calls the existing `finish()` (claim on step CONFIRM, then build and send) after removing the keyboard from the summary with `editMessageReplyMarkup`; Cancel resets the state and replies "Cancelled. Nothing was created. Send /start to begin again."
4. **Text at CONFIRM** replies "Please tap Confirm or Cancel on the summary above." and changes nothing.
5. `finish()` reads the description from the claimed state instead of taking it as an argument, and claims `step: CONFIRM`.

## Risks / Trade-offs

- One more tap for every QR. Accepted: that is the request, and it is the only protection against a mistyped payee.
- A user who spots a mistake must Cancel and start again. Editing single answers is deliberately left out to keep the bot small.
- The summary keeps the payee number in the chat history. It is the user's own private chat and the number was typed by them; the bot still stores nothing.
