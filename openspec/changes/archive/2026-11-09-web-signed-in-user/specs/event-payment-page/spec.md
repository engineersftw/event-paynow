## ADDED Requirements

### Requirement: Payer page shows the signed-in user and offers sign out

When a user is signed in, the payer page SHALL show their name in the header with a Sign out control. Signing out SHALL end the session in that browser and return the page to the anonymous form, without the user's history or private-copy behaviour.

#### Scenario: Name shown

- **WHEN** a signed-in user opens the payer page
- **THEN** the header shows their Telegram name and a Sign out button

#### Scenario: Sign out

- **WHEN** the user taps Sign out
- **THEN** the session is cleared, the page reloads as an anonymous visitor with the form and the optional sign-in block, and the user's earlier requests are no longer listed

#### Scenario: Anonymous visitor

- **WHEN** a visitor is not signed in
- **THEN** no user name or Sign out control is shown
