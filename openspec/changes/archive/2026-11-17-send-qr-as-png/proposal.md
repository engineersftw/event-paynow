# Proposal

## Why

The Event bot, the Simple bot and the copies the web pages send to Telegram upload each QR as a BMP of about 1 MB. The Split bot already sends the same image as a PNG of about 20 KB through a shared helper, so each upload is far smaller and quicker. The other bots should do the same.

## What Changes

- The Event bot's payment QR (`/start`) and payback QR, the Simple bot's QR, and the payment QR the web pages post to the event chat or send to the payer in a direct message are sent as PNG files instead of BMP.
- The call sites reuse the existing `qrPhoto` helper (grammY) or the existing `bmpToPng` conversion (Pages); the image content, size in pixels, caption, buttons and the names-only rule do not change.
- No queue is added: these bots send one QR per request, so the Split bot's send queue (many QRs at once, retry on rate limits) is not needed.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `payment-qr-issuance`: every QR image the bots and web pages send to Telegram is a PNG.

## Impact

- Code: `src/commands/start-handler.ts`, `payback-handler.ts`, `simple-handler.ts`, `src/web/handler.ts`, `src/web/telegram.ts`.
- Tests: assertions on the uploaded file name and type (`.bmp` to `.png`); the test harness already turns a PNG back into the renderer's bitmap, so the QR decode checks stay as they are.
- No database, configuration or deploy-order change.
