# Proposal

## Why

Event organisers can only see an event's payments through Telegram's `/payments`, which is paged, per-user and cramped. A small read-only web page gives an admin the whole picture of an event (every payment, status, totals) on one screen, without adding more bot commands.

## What Changes

- New `/web_admin` bot command: lists the chat's events and replies with a link button per event that opens that event's page on Cloudflare Pages.
- New Cloudflare Pages app (static page plus Pages Functions) with a Telegram Login Widget sign-in and an event page showing all payments for the event: description, payer name, amount, status (pending / received / voided), reference, created and received times, plus collected / pending totals.
- Pages Functions read D1 directly through the same `paynow_db` binding, reusing the existing repository code.
- Access rule: the signed-in Telegram user must be an administrator or owner of the event's chat (or the chat's own user for a private chat). Everyone else gets a "not allowed" page and sees no data.
- View only: no create, mark received, void or payback from the web.
- Not changed: bot flows, schema (no migration), captions, QR images.

## Capabilities

### New Capabilities
- `web-admin`: the `/web_admin` entry command, Telegram-login-authenticated access, and the read-only event payments page.

### Modified Capabilities

## Impact

- New `web/` directory (Pages project: `public/`, `functions/`), `wrangler` Pages config, new `npm` scripts for dev and deploy, CI type-check coverage for the functions.
- `src/bot.ts` (route `/web_admin`), a new `src/commands/web-admin-handler.ts`, `src/env.ts` (`WEB_ADMIN_URL`), `HELP_TEXT`.
- Pages project needs: D1 binding `paynow_db`, secrets `TELEGRAM_BOT_TOKEN` and `SESSION_SECRET`.
- Manual one-time step: register the Pages domain with BotFather (`/setdomain`) for the Login Widget.
- New repository method for listing all payments of an event, with tests.
