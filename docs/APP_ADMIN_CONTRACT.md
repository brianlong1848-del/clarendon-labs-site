# Plugging an app into the Studio inbox

The studio inbox (clarendon.dev/inbox and the Studio iOS Inbox tab) pulls from
platforms directly (Instagram, Facebook, App Store) and from **each app's own
admin API** for anything only the app knows: in-app feedback, support
messages, reports, card suggestions, refund requests…

Each app keeps its own database keys. clarendon.dev only holds a bearer token
per app, so a leak here can't write to any app's database.

## 1. Env vars

| Where                  | Variable                    | Value                                   |
|------------------------|-----------------------------|-----------------------------------------|
| the app's own Vercel   | `ADMIN_TOKEN`               | a long random secret                    |
| clarendon-labs-site    | `<APP>_ADMIN_URL`           | e.g. `https://gagorder.app`             |
| clarendon-labs-site    | `<APP>_ADMIN_TOKEN`         | the same secret                         |

`<APP>` is `ROLLIGAN`, `GAGORDER`, `YULEPICK` or `BOREA` (new apps: add the id
to `registry()` in `src/lib/console.ts`).

## 2. Endpoints (both behind header `x-admin-token`)

### `GET /api/admin/inbox`

```json
{ "items": [
  { "id": "fb_123",                     // stable, unique within the app
    "kind": "feedback",                 // message | comment | review | suggestion | feedback | mention
    "author": { "name": "Sam", "handle": "sam_rolls" },
    "title": "optional headline",
    "text": "The newest thing they said",
    "at": "2026-09-28T14:03:00Z",
    "context": { "label": "iOS 1.2 · iPhone 15" },
    "thread": [ { "from": "them", "text": "…", "at": "…" }, { "from": "us", "text": "…", "at": "…" } ],
    "needsReply": true,
    "actions": ["reply"],               // any of reply | approve | reject | hide
    "replyLimit": 2000,
    "replyNote": "Sent as an email to the player" }
] }
```

Return the last ~30 days. Anything older can drop off.

### `POST /api/admin/inbox`

```json
{ "id": "fb_123", "action": "reply", "text": "Thanks — fixed in 1.3!" }
```

Return `200 { "ok": true }`, or a 4xx/5xx with `{ "error": "readable reason" }`
— that message is shown to Brian as-is.

Read / done / snooze are tracked by the studio itself; the app never needs to.

## 3. That's it

The item shows up in both inboxes on the next refresh, tagged with the app and
"In-app". Nothing in the web page or the iOS app changes.
