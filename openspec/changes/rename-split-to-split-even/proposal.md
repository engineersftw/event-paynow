# Proposal

## Why

`/split` does not say what kind of split it starts, and it then asks Equally or Custom amounts, although `/split_custom` already starts a custom split directly. Naming the command `/split_even` makes the three commands read as a set (`/split_even`, `/split_custom`, `/split_receipt`) and removes a question from every even split.

## What Changes

- **BREAKING** `/split` is renamed `/split_even`. The bot no longer answers `/split` (chosen over a hidden alias).
- `/split_even` asks the payee, the total, the optional description and then the number of people, with no Equally / Custom amounts question. That question is removed from the bot.
- `/start` in a private chat replies with the help text listing the three commands instead of starting a split; in a group it stays unanswered.
- Amend → Split asks again for the details of the same kind of split (people for even, the list for custom) and no longer offers a switch; the user starts the other command instead.
- A receipt split where the user chooses to type the total instead continues as a custom split.
- Messages that said "send /split" now say "send /split_even or /split_custom"; the help text, the BotFather command list, the README and the Split landing page name the three commands.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: the even-split command is `/split_even`, `/split` is gone, `/start` shows the commands, the split-type question is removed, and Amend keeps the split type.

## Impact

- Code: `src/split-bot.ts` (commands), `src/commands/split-handler.ts` (start, `nextNeed`, the MODE step and its buttons, Amend, the receipt fallback, message texts, `SPLIT_HELP`), `src/split-qr-queue.ts` (failure notice), `src/web/page.ts` (Split landing page line).
- Tests: `test/workers/split-bot.test.ts` uses `/split` and the `split_mode:` buttons throughout; the landing-page test checks the command text.
- Users: anyone used to `/split` must use `/split_even`; the BotFather command list must be updated by hand (`setMyCommands` is not called by the code).
- No database, configuration or deploy-order change.
