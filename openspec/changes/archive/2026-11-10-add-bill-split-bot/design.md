## Context

Simple_PayNow_Bot is the closest model: a bot with no tables, its conversation held in the chat's Durable Object under a private key, QR built with `buildPayNowPayload` and `renderQrPng`, and a Confirm step guarded by the DO's atomic `POST /claim`. The event bot already knows how to record a conversation owner (`POST /owner`) so that only the starter's messages count in a group. The split bot needs both: Simple's flow shape and the event bot's group ownership.

## Goals / Non-Goals

**Goals:**
- `/split` works in a private chat and in a group, equal split only.
- Offer the group's member count as the number of people.
- Reuse the existing QR, amount, payee and conversation code. No database, no new dependency.

**Non-Goals:**
- Unequal splits, per-person QRs, payment tracking, `/stats` figures, other currencies.

## Decisions

1. **Own bot and webhook route** (`/webhook/split`, secrets `SPLIT_BOT_TOKEN` / `SPLIT_WEBHOOK_SECRET`, var `SPLIT_BOT_USERNAME`), mirroring the Simple bot exactly: 404 until configured, 403 on a wrong secret token, bot cached per isolate. The user chose a separate bot. This keeps its commands and group behaviour apart from the event bot.
2. **DO key `split-<chatId>`, new flow value `split`.** The `flow` enum in `conversation-do.ts` gains `'split'`. The key prefix keeps it from mixing with `chat-<id>` and `simple-<id>`.
3. **Steps:** 1 total, 2 people, 3 payee, 4 description (Skip), 5 confirm. Total comes before people because the people question is where the member-count button appears, and it is more natural to say "split 187.40 by 6?".
4. **Share maths in `src/commands/split-math.ts`:** `splitEqually(totalCents, people)` returns `{ shareCents: ceil(total / people), collectedCents: share * people, overCents }` with integers only. Rounding up means the payer is never short; over-collection is below `people` cents and is shown. The organiser is one of the N people and simply does not pay themselves, so the QR is for the other N−1. The summary says "Everyone else pays". People is 2–100 and at most `totalCents`, so a share is never below 1 cent.
5. **Member count:** `ctx.api.getChatMemberCount(chatId)` minus 1 for the bot. It counts every member, including other bots and people who are not eating, so it is only a suggestion; a typed number always wins. On an error or a result below 2 the button is not shown. Not asked in private chats.
6. **Group ownership:** after `/split` the handler stamps the owner via the DO's `POST /owner` (user + topic), and text and callbacks are accepted only from that user and topic. A callback from someone else is answered with a short "not your split" notice; their text is ignored silently, as in the event bot.
7. **Privacy mode stays on.** A bot in a group with privacy on sees commands and replies to its own messages, not ordinary text. So in groups each text question is sent with `force_reply` and `selective: true`, which makes Telegram open a reply to the bot's message. In a private chat plain text works as before. This avoids asking group admins to switch privacy off.
8. **Payee in a group:** the number is typed into the group chat, so the handler tries `deleteMessage` on the owner's payee message (needs the delete right; a failure is swallowed). The group summary shows only the type and the last four characters. The QR image and caption never carry the number, as in the other bots. Remaining risk, accepted: if the bot cannot delete, the number stays visible in the chat history. The README tells people to use a private chat when that matters.
9. **Confirm uses `POST /claim { flow: 'split', step: 5 }`** like the Simple bot, so a double tap sends one QR. The QR is a fixed amount (`editable: false`) for the share, with the description if given. Image lines: description, `SGD x.xx each (split N ways)`.
10. **No counters.** `usage_counters` and `/stats` are untouched. Adding them later is one new metric name.

## Risks / Trade-offs

- [Member count is wrong (bots, lurkers)] → treated as a suggestion only; the user can type any number.
- [Payee number visible in a group if the bot cannot delete] → best-effort delete, masked summary, README advice.
- [Rounding up collects a few cents too many] → shown in the summary; at most N−1 cents over.
- [Force-reply is Telegram-client dependent] → if a user types without replying, nothing happens; the prompt text says to reply to it.

## Migration Plan

No database change. Deploy as usual; the route stays 404 until the owner creates the bot in BotFather, runs `wrangler secret put SPLIT_BOT_TOKEN` and `SPLIT_WEBHOOK_SECRET`, and registers the webhook with `setWebhook` (secret token = `SPLIT_WEBHOOK_SECRET`). Rollback: unset the secret or delete the webhook.
