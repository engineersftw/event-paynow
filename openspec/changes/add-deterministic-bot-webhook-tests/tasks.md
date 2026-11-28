# Tasks

## 1. Webhook harness and first journey

- [x] 1.1 Add an internal bot-provider seam that preserves the default Worker routing, lazy initialization, caching, and secret validation. Verify missing and incorrect secrets return 403 without invoking the bot provider, and existing route tests still pass.
- [x] 1.2 Extend the Workers harness to submit signed updates, drain background work, tap buttons by their captured message IDs, and decode QR amounts. Verify through a Simple journey that confirmation sends exactly one QR for the expected amount.
- [x] 1.3 Document how to run and extend the suite in `docs/testing.md`, including how to add fixtures and await background work. Verify the documented command discovers the Simple journey.

## 2. Payment and receipt journeys

- [x] 2.1 Add a signed Event journey that issues a payment for a seeded event, decodes the expected QR amount, and taps Received. Verify the resulting Telegram status and the received D1 payment row.
- [x] 2.2 Add a signed Split receipt journey with tea at SGD 1.80, Milo at SGD 3.80, zero GST, no service charge, and a total of SGD 5.80. Verify that the review blocks continuation and reports the unexplained SGD 0.20. Add a missing cup modifier, assign it with the tea, confirm, and verify the summary and decoded QR amounts of SGD 2.00 and SGD 3.80.

## 3. CI verification

- [x] 3.1 Run the existing build, lint, Node, and Workers CI commands. Verify the three journeys run without production credentials or live Telegram or AI calls.
