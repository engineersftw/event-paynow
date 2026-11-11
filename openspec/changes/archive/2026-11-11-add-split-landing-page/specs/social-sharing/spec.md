## ADDED Requirements

### Requirement: The Split page carries its own preview

The Split PayNow Bot page SHALL include Open Graph and Twitter card tags in its server-rendered head, with a title and description about splitting a bill, its own absolute URL, and its own 1280x720 JPEG preview image served from the site and under 200 KB. Every value SHALL be escaped.

#### Scenario: Tags present

- **WHEN** `/split` is fetched
- **THEN** its head has a title, a description, a canonical link and Open Graph and Twitter card tags that point to the page's own URL

#### Scenario: The image

- **WHEN** the Split preview image URL is requested
- **THEN** it returns a JPEG of 1280 by 720 pixels that is under 200 KB
