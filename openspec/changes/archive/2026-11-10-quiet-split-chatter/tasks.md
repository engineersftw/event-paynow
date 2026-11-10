## 1. Handler

- [x] 1.1 In `handleText` (`src/commands/split-handler.ts`) return without replying when the step takes no typed text and the chat is a group; keep both hint messages for private chats

## 2. Tests and checks

- [x] 2.1 Extend `test/workers/split-bot.test.ts`: organiser text while claiming in a group gets no reply and the claims are unchanged, no reply at the review and the summary in a group, the hint still appears in a private chat, and a typed answer in a group still works
- [x] 2.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
