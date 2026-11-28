# Design

## Context

The Workers pool already runs on PRs and main. Existing journeys call grammY directly with test bot info and a Telegram fetch stub. The Worker routes validate each webhook secret and call handlers that obtain isolate-cached bots. The shared update handler acknowledges requests before bot processing completes.

## Goals / Non-Goals

**Goals:** Exercise signed HTTP requests against the real route, then verify results using real bot handlers, D1, Durable Objects, and QR rendering where relevant.

**Non-Goals:** Provision staging, contact live services, or reproduce Telegram client behavior in CI. Keep existing Workflow and Queue tests in place.

## Decisions

- Keep the production Worker export and lazy, isolate-scoped bot caching. Introduce a narrow internal construction seam for the bot providers used by the router so tests can supply fresh instances from the existing bot factories. The production entry keeps its defaults. Test dependencies must never be selectable through HTTP.
- Reuse the update builders and Telegram stub in `test/workers/harness.ts`. Each journey owns its bot, stub, and synthetic chat and update IDs. Build callback updates from the actual captured keyboard and its message ID. Reject unexpected Telegram calls in the harness.
- Collect the promises registered with `waitUntil` and drain them after each response. The acknowledgement alone is insufficient because the handler catches background failures. Check expected outbound effects after every significant transition and require no background failure for successful journeys.
- Apply the existing test schema and use local storage bindings. Supply a fixed scan and an in-memory photo download for Split. Exercise its supported direct-send path in this suite. Decode the captured images with the existing QR test utilities and assert on the SGQR amount field, alongside visible messages and buttons.
- Add scenarios under `test/workers/` so the existing required CI job runs them. An extra job or live-service setup adds overhead without improving these deterministic checks.

## Risks / Trade-offs

- An injected bot provider could conceal production wiring regressions. Share the same routing and webhook acceptance code, preserve the default providers, and run the existing webhook and flow tests.
- Storage is isolated per file. Use distinct identifiers for scenarios that share a file. Await effects instead of polling or sleeping.
- The fixture covers how the bot handles scan output. Real OCR quality and deployed Telegram delivery remain staging concerns.

## Migration Plan

No schema, credential, or CI configuration migration is needed. Roll back by reverting the test tooling and its construction seam together.
