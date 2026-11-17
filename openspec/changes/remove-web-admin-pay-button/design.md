# Design

## Context

`WebAdminCommandHandler` builds one row per event: with `EVENT_APP_NAME` set, the Mini App link then 🌐 then 💳 Pay; without it, the event link then Pay. Telegram gives each button in a row an equal share of the width, so the label gets a third (or half) and is truncated with an ellipsis. See proposal.md - Why.

## Goals / Non-Goals

**Goals:** a wider event button, so names are readable; no loss of access to the payer link.

**Non-Goals:** moving the 🌐 button to its own row, shortening labels, or changing `/web_payment`.

## Decisions

1. **Drop the Pay button.** Two buttons per row (event, 🌐) gives the name half the width, up from a third; with no Mini App the single button is full width. `/web_payment` already lists the payer link per event, and the event page has a Pay button, so nothing becomes unreachable.
2. **Keep 🌐 in the row.** It is the only way to reach the browser page when the Mini App is on, and removing it was not asked for. If names are still cut at half width, putting 🌐 below the name is a follow-up.

## Risks / Trade-offs

- **Names can still be cut** at half width (about 12 to 15 characters on a phone). Judged by the live check; the row layout is Telegram's.
- **Admins who used Pay here** must use `/web_payment` or the event page.
