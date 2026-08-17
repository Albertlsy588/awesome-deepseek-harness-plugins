# @dsh-1024store/core

Modules that more than one app needs, kept in exactly one place.

Nothing here is compiled or published. Consumers (`apps/web`, `apps/community`)
import the TypeScript source and bundle it themselves, so there is no build step
to keep in sync and no chance of an app running a stale copy.

| Export | Why it is shared |
| --- | --- |
| `./auth` | Session issue/validate/revoke and the GitHub OAuth exchange. A second copy of session validation is a security bug waiting to happen — both Workers read the same `api_sessions` rows, so they must agree byte for byte on what a valid session is. |
| `./api-quota` | Fixed-window rate limiting over `api_request_counters`. |
| `./plugin-id` | Plugin identity: parsing, normalising, and the canonical detail path. The community parses `@owner/name` mentions with the same rules the catalog uses. |
| `./tokens.css` | The design tokens. Both front-ends render the same brand. |
| `./testing/d1` | A `D1Database` backed by `node:sqlite`, for tests. |

Add something here only when a second app actually needs it. App-specific code
stays in the app.
