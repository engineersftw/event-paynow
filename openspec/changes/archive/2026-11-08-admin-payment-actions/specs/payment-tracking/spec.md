# Spec Delta

## MODIFIED Requirements

### Requirement: User can list and inspect payments

The system SHALL let a user view their payment records, including pending ones with description, amount, and age, and SHALL isolate each user's records from other users, except that a chat administrator also sees every payment of their chat's events when drilling into an event.

#### Scenario: Listing payments

- **WHEN** a user requests their payment list
- **THEN** the system shows that user's payments with status, description, amount, and date, and shows no records belonging to other users
