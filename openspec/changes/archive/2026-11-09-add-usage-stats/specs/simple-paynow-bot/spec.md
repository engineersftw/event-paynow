## MODIFIED Requirements

### Requirement: Nothing is stored

The system SHALL NOT write payee numbers, amounts, descriptions, generated QR codes or user or chat identities to the database or to logs; the only thing it records is an anonymous count per day (see the usage-stats capability). The answers of an unfinished conversation SHALL be held only in the per-chat conversation state, which SHALL expire after 10 minutes of inactivity and SHALL be cleared when the QR is sent or the user cancels.

#### Scenario: After the QR is sent

- **WHEN** the QR has been sent
- **THEN** the conversation state holds none of the answers and the only database change is the anonymous daily count

#### Scenario: Abandoned conversation

- **WHEN** the user stops answering for 10 minutes
- **THEN** the state is cleared and the next `/start` begins fresh

#### Scenario: Nothing personal in the counts

- **WHEN** the daily counters are inspected after several QRs were made
- **THEN** they hold only a day, a metric name and a number, with no payee, amount, description, user id or chat id
