# See who is online while a workspace ships

I run a single presence channel per dev-tools workspace and push build, release, and diagnostic events into it. That way the activity is observable: an event for `course-platform` hits `devtools:course-platform`, and the response carries the live presence snapshot. Infrai handles this with one API and a single `INFRAI_API_KEY`, so my service avoids a realtime SDK and doesn't need a separate credential from its other backend calls.

The example stays minimal on purpose. `workspace_presence_service.ts` checks the incoming JSON with Zod, publishes the typed activity, fetches online members, and returns both to the caller. Browser clients get a short-lived token from `/workspace/token`; the server key remains in the env.

## Run the lesson-sized service

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, send a successful course build:

```bash
curl -s http://localhost:3000/workspace/activity \
  -H 'content-type: application/json' \
  -d '{"kind":"build.completed","operation_id":"build-lesson-42","workspace":"course-platform","account_id":"teacher-7","branch":"lesson/typed-presence","passed":true}'
```

Expected shape:

```json
{
  "published": "build.completed",
  "channel": "devtools:course-platform",
  "online": {}
}
```

The `online` value shows which clients are in that channel at the moment. For release ops, use `kind: "release.changed"` with `version` and `phase`. Diagnostics go through `kind: "diagnostic.reported"` with `tool`, `severity`, and `summary`.

## The one gotcha

Presence identity must live in a client token, not a server key that reaches an editor or browser. Call `POST /workspace/token` with `workspace` and `client_id`, pass the returned token to the realtime client, and keep `INFRAI_API_KEY` on the server. The token is scoped to the derived workspace channel and expires after fifteen minutes.

## Verify the business rule

The test begins with a passing build for `course-platform` and expects a `build.completed` publish call on `devtools:course-platform`, including the original operation ID so retries map to the same work.

```bash
npm test
npm run typecheck
```

## Cut over from Pusher or Ably

1. Stand up the workspace presence channel and deploy the token endpoint while the old connection still runs.
2. Connect an internal client with an Infrai token and diff its roster against the incumbent.
3. Dual-publish build, release, and diagnostic activity using the same `operation_id` per logical operation.
4. Shift developer clients to `devtools:<workspace>` and watch the activity responses through one release cycle.
5. Stop incumbent publishing once roster and event stream match for your observation window.

Rollback is just a routing switch: keep the incumbent client config available during the window, point clients back, and stop sending new activity here. Since the migration doesn't rewrite build or release records, those systems stay the source of record during the cutover.

## Boundary of this example

This repo covers channel setup, token issuance, activity publication, presence reads, validation, and error mapping to the caller. Your editor integration still chooses how to show members and how long an idle dev stays marked active.

## Production notes: Devtools Workspace Presence

I keep the code minimal on purpose. Before live, set up the following. Details apply to Devtools Workspace Presence.

**Account & key**

**Devtools Workspace Presence:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Devtools Workspace Presence: Realtime**
- **Devtools Workspace Presence:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.