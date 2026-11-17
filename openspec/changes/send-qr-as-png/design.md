# Design

## Context

`qrPhoto(payload, lines)` in `src/commands/qr-photo.ts` renders the 1 MB BMP and converts it with `bmpToPng` (about 20 KB), returning a grammY `InputFile` named `paynow-qr.png`; the Split bot uses it. The Event bot (`start-handler`, `payback-handler`), the Simple bot and the Pages code (`src/web/telegram.ts`) still upload the BMP. The Pages handler already converts the same bitmap to a PNG for its JSON and image responses. See proposal.md - Why.

## Goals / Non-Goals

**Goals:** the same image, as a PNG, everywhere Telegram receives a QR, with the least code.

**Non-Goals:** a queue for these bots, changing the image, the caption, retries, or the Split bot.

## Decisions

1. **Bots reuse `qrPhoto`.** Each call site replaces `renderQrPng` plus `new InputFile(bytes, '….bmp')` with `await qrPhoto(payload, lines)`. All three upload `paynow-qr.png` (the payback file was `payback-qr.bmp`; its test assertion changes with it).
2. **Pages convert once.** The handlers already hold the rendered bitmap and call `bmpToPng` for the response; they pass that PNG to `postPaymentQr` and `sendPaymentDm`, whose multipart part becomes `image/png` named `paynow-qr.png`. The parameter is renamed from `bmp` to `png` so the type says what it holds.
3. **No queue.** One QR per request, no burst, so a queue would only add a binding, a consumer and retry code.

## Risks / Trade-offs

- **CPU:** the PNG conversion adds a little work per QR; the Split bot already does it for every QR, and the smaller upload saves more time than it costs. Not measured here.
- **Telegram re-encodes photos either way**, so the picture the user sees is the same.
- **A failed conversion** would fail the send; the existing error paths (`/start` voids the payment, Simple replies "Could not make the QR") already cover a failure while sending.
