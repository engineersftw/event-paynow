# Spec Delta

## ADDED Requirements

### Requirement: Payback QR images use the same logo and text style

The system SHALL render payback QR images with the same bot logo in the centre and the same smooth text font as payment QR images, with the same scannability requirement.

#### Scenario: Payback image

- **WHEN** a payback QR image is generated with its detail lines
- **THEN** it shows the bot logo in the centre and the lines in the smooth font, and decodes to the payback payload
