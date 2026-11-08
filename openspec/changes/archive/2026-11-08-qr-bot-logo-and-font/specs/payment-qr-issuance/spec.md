# Spec Delta

## ADDED Requirements

### Requirement: The QR image carries the bot logo in its centre

The system SHALL draw the bot's logo, in colour with smooth edges, over a white clear box at the centre of every QR image, in place of any other logo. The logo and its clear box SHALL cover no more of the QR than error-correction level H can recover, and the QR SHALL still decode to the same payload.

#### Scenario: Logo in the centre

- **WHEN** a payment QR image is generated
- **THEN** the bot logo's colours appear in the centre of the QR on a white clear box, and the PayNow wordmark does not

#### Scenario: Still scannable

- **WHEN** the image is decoded for payloads of short and long length
- **THEN** each decodes to its original payload

### Requirement: Image text uses a smooth proportional font

The system SHALL draw the detail lines under the QR in an anti-aliased proportional font rather than a blocky pixel font, with each line on its own row, black on white, and legible at the image's width as shown in Telegram. Lines wider than the image SHALL be shortened with an ellipsis measured by the font's own widths, and characters the font does not provide SHALL be drawn as `?`.

#### Scenario: Smooth text

- **WHEN** a payment QR image is generated with detail lines
- **THEN** the lines are drawn with anti-aliased glyphs (intermediate grey levels at glyph edges) and none runs past the image edge

#### Scenario: Wide line

- **WHEN** a detail line is wider than the image
- **THEN** it is shortened with an ellipsis so that it fits

#### Scenario: Unsupported character

- **WHEN** a line contains a character outside the font's coverage
- **THEN** that character is drawn as `?`
