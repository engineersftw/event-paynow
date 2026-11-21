# Design

## Context

`createSplitBot` registers `/split` (no mode), `/split_custom` (`mode: 'custom'`), `/split_receipt` (`entry: 'receipt'`) and `/start` in private chats (same as `/split`). `nextNeed` returns the MODE step when the context has no `mode`; MODE shows Equally / Custom amounts (`split_mode:equal|custom`). Amend → Split goes to MODE. The receipt scan's "type the total instead" (`split_scan:manual`) drops `mode` and so reaches MODE. See proposal.md - Why.

## Goals / Non-Goals

**Goals:** `/split_even` starts an even split with one question fewer; no code path can reach the removed question.

**Non-Goals:** an alias for `/split` (the owner chose to drop it); calling Telegram's `setMyCommands`; changing custom or receipt splits beyond the fallback.

## Decisions

1. **Mode is always set at the start.** `/split_even` starts with `mode: 'equal'`, `/split_custom` with `mode: 'custom'`, `/split_receipt` sets `custom` when the scan is used (as today). The receipt fallback `split_scan:manual` keeps `mode: 'custom'` (the user was splitting by items, so a custom list follows). `nextNeed` then never needs MODE.
2. **Remove the MODE step and its buttons.** Delete the step constant's prompt, the `split_mode:` handler and the Amend path to it. A tap on an old Equally / Custom amounts button from a message sent before the deploy gets the existing stale-button answer, because no step accepts it any more; nothing is created.
3. **Amend → Split keeps the type.** It goes to PEOPLE for an even split and to LIST for a custom one (the receipt menu offers Items, unchanged).
4. **`/start` replies with `SPLIT_HELP`** in a private chat. The help text is rewritten around the three commands.
5. **One wording for "start again".** Every message that told the user to send `/split` says "send /split_even or /split_custom": the cancel reply, the expired popup, the no-split hint, QR captions and failure notices, and the receipt-unavailable reply (which says `/split_custom`, as typing the total then continues as a custom split).

## Risks / Trade-offs

- **People who type `/split` get no reply** (by choice). The help text and BotFather list are the guide; the README notes the rename.
- **The BotFather command list must be edited by hand** after deploy, or Telegram's menu will still show `/split`. It is a rollout step.
- **A split in progress at deploy time** that is waiting at the old MODE step: its buttons get the stale answer and the user starts again. Splits last at most an hour.
