## Why

When everyone claims their own items in a group, the organiser fixes mistakes and fills gaps through a menu in the chat: tap an item, tap a person, tap again, one item at a time. For a 12-item receipt with six people that is dozens of taps and a menu message that keeps jumping in the chat, and typing a name for someone who is not in the chat means a force-reply round trip each time. The organiser needs to see all items and all people at once and change them in a few taps.

A Telegram Mini App is a web page that opens inside Telegram, signed in as the person who opened it. It can show the items and the people as one grid and change the claims directly, with no chat bubbles.

## What Changes

- The claim message of a group's self-claim split gets an **Edit in app** button, shown only when the Mini App is configured. It opens a Mini App for the organiser; it is a link button, because Telegram only allows `web_app` buttons in private chats and claiming happens in groups.
- The Mini App (one HTML page served by the Worker) shows every item with its price and holders as a grid of items and people. The organiser can: toggle a person on an item, add a person by typing a name or `@username`, share an item N ways (or remove the ways), remove all claims of an item, and claim for themselves. Locked items (someone on them already has their QR) are shown but cannot be changed.
- The page uses the same rules as the chat menu: the same 20-person limit, 20-character names, N-way limits and locks. Every change goes through the same conditional write the chat taps use, so taps from members and edits from the app are all kept. The claim message in the chat is refreshed after each change, as it is after a tap.
- The Worker checks who is calling: the page sends Telegram's signed launch data (`initData`); the Worker verifies it with the Split bot's token and accepts only the organiser of that chat's active conversation. Anyone else gets a refusal.
- The page does not finish the split. Done, the unassigned-items choice and the summary stay in the chat.

Out of scope: members claiming through the app (they keep the chat buttons); private chats (no self-claim there); finishing or confirming the split from the app; picking people from the group's member list (the Bot API has no member list; typed names and `@username` only, as in the chat menu); a payee, total or description editor; live push updates (the page polls); any storage outside the chat's Durable Object.

## Capabilities

### New Capabilities

- `split-claim-app`: the Edit in app button, who may open and change claims through the Mini App, what the page can change and which chat rules still bind it, and what it stores.

### Modified Capabilities

(none)

## Impact

- New `src/split-app/`: `init-data.ts` (verify Telegram's launch data), `api.ts` (JSON routes), `page.ts` (the HTML page as a string, no build step), and the claim edits shared with the chat.
- `src/commands/split-handler.ts`: the pure claim logic (`applyClaim`, `claimText`, `claimButtons`) and the conditional-write loop (`mutateClaims`) move to a place both the chat handler and the app API can call, without a grammY `Context`; `claimButtons` adds the link button when the app is configured.
- `src/worker.ts`: routes `GET /split-app` (page) and `/split-app/api/*`, 404 until configured, like `/webhook/split`.
- `src/env.ts`, `wrangler.toml`: `SPLIT_APP_NAME` var (the Mini App's short name from BotFather); uses the existing `SPLIT_BOT_TOKEN` and `SPLIT_BOT_USERNAME`.
- Setup by hand, once: in BotFather, `/newapp` for the Split bot with the Worker's `/split-app` address and a short name, then set `SPLIT_APP_NAME`.
- Tests: launch-data verification (valid, wrong hash, expired, wrong bot), API (organiser allowed, member and stranger refused, each edit, locks, stale conversation, concurrent edits), claim message refresh, button shown only when configured.
- Docs: README (setup step, structure, env var), AGENTS.md, `docs/architecture.md`, the `/split` landing page (it lists what the bot stores).
- Privacy: the page and its API read and write only the chat's Durable Object, the place the claims already live. Nothing is logged or stored elsewhere. Telegram's script (`telegram.org/js/telegram-web-app.js`) is loaded by the page.
