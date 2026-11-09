## ADDED Requirements

### Requirement: Event page shows the signed-in user and offers sign out

When a user is signed in, the event page SHALL show their name in the header with a Sign out control, including when the page refuses them because they are not an admin of the event chat. Signing out SHALL end the session in that browser and return the page to its sign-in prompt.

#### Scenario: Name shown

- **WHEN** a signed-in admin opens the event page
- **THEN** the header shows their Telegram name and a Sign out button

#### Scenario: Signed in but not an admin

- **WHEN** a signed-in user who is not an admin of the event chat opens the page
- **THEN** the page is refused as before and still shows their name and Sign out so they can switch account

#### Scenario: Sign out

- **WHEN** the user taps Sign out
- **THEN** the session is cleared, the page reloads and shows the Telegram sign-in prompt, and the event's payments are no longer shown

#### Scenario: Session without a stored name

- **WHEN** the user signed in before names were remembered
- **THEN** the header shows a plain "Signed in" label with the Sign out button

#### Scenario: Not signed in

- **WHEN** nobody is signed in
- **THEN** no user name or Sign out control is shown
