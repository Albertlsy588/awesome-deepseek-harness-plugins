# Repository instructions

## Public URL stability

- The plugin catalog uses the canonical public path `/plugin`.
- Plugin detail pages use the canonical public path `/plugin/:owner/:name` (singular `plugin`).
- Plugin API routes use `/api/plugin` and `/api/plugin/:owner/:name`.
- Treat public route paths as permanent SEO contracts. Do not rename or remove them without explicit user approval and a migration plan covering permanent redirects, canonical URLs, and existing inbound links.
- When replacing an already-published route, keep a permanent redirect from the old path to the canonical path.
