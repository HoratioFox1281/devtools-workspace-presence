import { z } from "zod";

export const workspaceActivitySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("build.completed"),
    operation_id: z.string().min(1),
    workspace: z.string().min(1),
    account_id: z.string().min(1),
    branch: z.string().min(1),
    passed: z.boolean(),
  }).strict(),
  z.object({
    kind: z.literal("release.changed"),
    operation_id: z.string().min(1),
    workspace: z.string().min(1),
    account_id: z.string().min(1),
    version: z.string().min(1),
    phase: z.enum(["started", "completed", "rolled_back"]),
  }).strict(),
  z.object({
    kind: z.literal("diagnostic.reported"),
    operation_id: z.string().min(1),
    workspace: z.string().min(1),
    account_id: z.string().min(1),
    tool: z.string().min(1),
    severity: z.enum(["info", "warning", "error"]),
    summary: z.string().min(1).max(240),
  }).strict(),
]);

export type WorkspaceActivity = z.infer<typeof workspaceActivitySchema>;

export function workspaceChannel(workspace: string): string {
  return `devtools:${workspace}`;
}

export function eventFor(activity: WorkspaceActivity) {
  const { operation_id, workspace, account_id, kind, ...detail } = activity;
  return {
    channel: workspaceChannel(workspace),
    event: kind,
    data: { operation_id, ...detail },
    account_id,
  };
}
