# API

[Back to the README](../README.md)

The frontend calls same-origin API routes. Vite serves these during development; the bundled Node server serves the same handlers after deployment.

| Method and path | Input | Result |
| --- | --- | --- |
| `GET /api/board` | None. | Public members, repositories, timestamps, invite settings and weights. |
| `POST /api/preview` | JSON with `github`, `nickname`, `whatsapp`. | Profile stats and score after confirming group membership. The old username-only GET is rejected. |
| `POST /api/register` | JSON with `github`, `nickname` and `whatsapp`. | Registered login and the updated public board. |
| `GET /api/community` | Visitor cookie, created if absent. | Tools, public vote counts and this visitor's vote selections. |
| `POST /api/vote` | Repository: JSON `{ "target": "repo:ID", "active": true }` with visitor cookie. Tool: `{ "target": "tool:ID", "value": 1 }` with GitHub session; value is -1, 0 or 1. | Target, saved state and current vote score. |
| `GET /api/auth-start` | None. | Redirect to GitHub public-profile sign-in. |
| `GET /api/auth-callback` | GitHub code, matching state and OAuth cookie. | Verified session, then redirect to `/tools`, `/participation` or `/admin` according to the sign-in flow. |
| `GET /api/participation` | Signed-in GitHub session. | Private group activity, projects, help requests and contributions. |
| `POST /api/participation` | Same-origin JSON with a signed-in GitHub session; a linking request uses `{ "action": "link", "phone": "+2348000000000" }`. | A linking code or the updated private participation state. |
| `POST /api/auth` | Same-origin JSON request with GitHub session cookie. | Revokes the session and clears its cookie. |
| `POST /api/tools` | JSON with `name`, `url`, `description` and `category`. | Pending tool, not included in the public directory. |
| `GET /api/tools` | Approved admin session cookie. | Private tool review queue and approved community tools. |
| `PATCH /api/tools` | Approved admin session cookie, same-origin JSON and `X-OpenCircle-Admin: 1`; body `{ "id": "TOOL_ID", "action": "approve" }`. | Approves a submitted tool for public listing and voting. |
| `DELETE /api/tools` | Approved admin session cookie, same-origin JSON and `X-OpenCircle-Admin: 1`; body `{ "id": "TOOL_ID" }`. | Removes a community tool and its votes. |
| `GET /api/admin` | Approved admin session cookie. | Members including WhatsApp numbers, plus settings. |
| `POST /api/admin` | Approved admin session cookie, same-origin JSON and `X-OpenCircle-Admin: 1`; body is an admin action. | Updated admin state. |
| `GET /api/admin-session` | No credentials required. | Whether admin access is configured, and the current approved admin profile if signed in. |
| `DELETE /api/admin-session` | Same-origin JSON and `X-OpenCircle-Admin: 1`. | Revokes the current admin session and clears its cookie. |
| `POST /api/analytics` | Same-origin JSON with a public `page` path and `referrer` origin. | Records a page view and establishes an anonymous analytics cookie. |
| `GET /api/analytics?days=30` | Approved admin session; `days` is 7, 30 or 90. | Private traffic totals, daily chart data, popular pages, referral domains and community growth. |

Admin actions are `hide`, `unhide` and `remove`, with a `login`, or `config`, with complete invite and weight settings. The exact request and response types live in [`shared/types.ts`](../shared/types.ts).

Errors have a consistent shape:

```json
{
  "error": {
    "code": "invalid_github",
    "message": "That isn't a valid GitHub username.",
    "field": "github"
  }
}
```

The `field` property is optional. Validation failures return 400, missing profiles return 404, identity conflicts return 409, organisation profiles return 422, throttled requests return 429, and unavailable GitHub or storage returns 503. JSON request bodies are limited to 4 KiB. Unexpected failures return 500 without exposing their internal details to the client.

Profile previews and registration have one-minute request limits:

| Operation | Per client IP | Per GitHub username |
| --- | --- | --- |
| Preview | 30 | 10 |
| Registration | 10 | 5 |

These limits protect the lookup and registration paths from repeated requests. Group membership is checked separately through the bot; request limits do not verify identity.

Community writes require same-origin JSON requests and the visitor cookie established by `GET /api/community`; voting and sharing require cookies to be enabled. Votes are limited to 60 requests per minute for both the client IP and visitor. Tool submissions are limited to five per hour for both. Rejected requests return 429 with `Retry-After`. Community request/response contracts live in `shared/community.ts`, with shared tool validation in `shared/tool-validation.ts`.

Analytics counts distinct browsers using a separate HttpOnly cookie and stores only its namespaced hash, daily totals, allowlisted public paths and referral hostnames. It does not store IP addresses, referral paths or query strings. Known bot user agents, DNT/GPC opt-outs and admin paths are excluded. Blocked scripts, disabled cookies and multiple devices affect the audience counts. Returning visitors visited on at least two UTC days within the selected period. Referral totals count page views, with missing or internal referrals grouped as Direct. New visits prune records to a 180-day window; Redis also expires old records automatically. The collection start timestamp remains. Previous-period traffic comparisons appear only after a complete prior period has been collected. Growth counts use existing member and tool creation dates and exclude deleted records. The write endpoint permits 240 requests per IP and 60 per anonymous browser per minute; the existing request limiter handles IP keys separately from analytics records.
