# Repository instructions

## Public URL stability

- The plugin catalog uses the canonical public path `/plugin`.
- Plugin detail pages use the canonical public path `/plugin/:owner/:name` (singular `plugin`).
- Plugin API routes use `/api/plugin` and `/api/plugin/:owner/:name`.
- Treat public route paths as permanent SEO contracts. Do not rename or remove them without explicit user approval and a migration plan covering permanent redirects, canonical URLs, and existing inbound links.
- When replacing an already-published route, keep a permanent redirect from the old path to the canonical path.

## Responsive web support

- The website supports both desktop and mobile devices. Treat both layouts as first-class release requirements.
- For every UI, layout, spacing, or typography change, design and verify both a desktop viewport and a mobile viewport; do not approve a change based on desktop appearance alone.
- As a minimum visual check, use representative viewports around 1440×900 for desktop and 390×844 for mobile, and confirm there is no unintended horizontal overflow, clipping, overlap, or unreadably small text.
- Avoid desktop-only assumptions such as fixed content widths, hover-only interactions, or controls that are too small for touch. Preserve readable typography, usable touch targets, and clear information hierarchy at both sizes.
