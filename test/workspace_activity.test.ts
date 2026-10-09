import assert from "node:assert/strict";
import test from "node:test";
import { eventFor, workspaceActivitySchema } from "../src/workspace_activity.js";

test("a completed course build becomes a workspace-scoped event", () => {
  const activity = workspaceActivitySchema.parse({
    kind: "build.completed",
    operation_id: "build-lesson-42",
    workspace: "course-platform",
    account_id: "teacher-7",
    branch: "lesson/typed-presence",
    passed: true,
  });

  assert.deepEqual(eventFor(activity), {
    channel: "devtools:course-platform",
    event: "build.completed",
    data: {
      operation_id: "build-lesson-42",
      branch: "lesson/typed-presence",
      passed: true,
    },
    account_id: "teacher-7",
  });
});
