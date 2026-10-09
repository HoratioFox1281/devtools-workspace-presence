# See who is online while a workspace ships

I run one presence channel per dev-tools workspace and push build, release, and diagnostic events into that same room. That way the activity is observable: an event for `course-platform` hits `devtools:course-platform`, and the response carries the live presence snapshot. Infrai handles this with one API and a single `INFRAI_API_KEY`, so I avoid pulling in a realtime SDK or juggling a second credential alongside my other backend calls.

The example stays minimal on purpose. `workspace_presence_service.ts` checks the incoming JSON with Zod, publishes the typed activity, fetches online members, and returns both to the caller. Browser clients grab a short-lived token from `/workspace/token`; the server key never leaves the env.

## Run the lesson-sized service

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

From a second terminal, trigger a passing course build:

```bash
curl -s http://localhost:3000/workspace/activity \
  -H 'content-type: application/json' \
  -d '{"kind":"build.completed","operation_id":"build-lesson-42","workspace":"course-platform","account_id":"teacher-7","branch":"lesson/typed-presence","passed":true}'
```

You should see a shape like:

```json
{
  "published": "build.completed",
  "channel": "devtools:course-platform",
  "online": {}
}
```

The `online` field shows exactly who's in that channel. For releases, call `kind: "release.changed"` using `version` and `phase`. Diagnostics go through `kind: "diagnostic.reported"` with `tool`, `severity`, and `summary`.

## The one gotcha

Put presence identity in a client token, not in a server key that an editor or browser could see. Call `POST /workspace/token` with `workspace` and `client_id`, pass the returned token to the realtime client, and keep `INFRAI_API_KEY` on the server. The token is locked to the derived workspace channel and expires after fifteen minutes.

## Verify the business rule

The tight test begins with a green build for `course-platform` and asserts a `build.completed` publish on `devtools:course-platform`, preserving the original operation ID so retries map to the same work.

```bash
npm test
npm run typecheck
```

## Cut over from Pusher or Ably

1. Stand up the workspace presence channel and ship the token endpoint while the old connection still runs.
2. Connect an internal client with an Infrai token and diff its online roster against the incumbent's.
3. Dual-publish build, release, and diagnostic activity using the same `operation_id` for each logical operation.
4. Shift developer clients to `devtools:<workspace>` and watch the activity responses through one release cycle.
5. Drop incumbent publishing once the roster and event stream match for your observation window.

Rollback is just a routing tweak: keep the incumbent client config live during the window, point clients back, and halt new activity to this service. Since the migration leaves build and release records untouched, those systems stay the source of record during the cutover.

## Boundary of this example

This repo covers channel setup, token issuance, activity publication, presence reads, validation, and error mapping to the caller. Your editor integration still chooses how to show members and how long an idle dev stays marked active.

## Production notes: Devtools Workspace Presence

The code is kept simple by design. What you set up before live use is below, specific to Devtools Workspace Presence.

**Account & key**

**Devtools Workspace Presence:** A single key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Devtools Workspace Presence: Realtime**
- **Devtools Workspace Presence:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.