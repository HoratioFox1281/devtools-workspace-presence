import { createServer, type ServerResponse } from "node:http";
import { z, ZodError } from "zod";
import { createInfraiRealtime, InfraiError } from "./infrai_realtime.js";
import { eventFor, workspaceActivitySchema, workspaceChannel } from "./workspace_activity.js";

const envSchema = z.object({
  INFRAI_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
});
const env = envSchema.parse(process.env);
const infrai = createInfraiRealtime(env.INFRAI_API_KEY);
const readyChannels = new Map<string, Promise<void>>();

function ensureWorkspaceChannel(workspace: string): Promise<void> {
  const channel = workspaceChannel(workspace);
  const pending = readyChannels.get(channel);
  if (pending) return pending;
  const setup = infrai.realtime.channel.create(
    { channel, type: "presence" },
    `setup-${workspace}-presence`,
  ).then(() => undefined).catch((error: unknown) => {
    readyChannels.delete(channel);
    throw error;
  });
  readyChannels.set(channel, setup);
  return setup;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const tokenBodySchema = z.object({
  workspace: z.string().min(1),
  client_id: z.string().min(1),
}).strict();

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/workspace/activity") {
      const activity = workspaceActivitySchema.parse(await readJson(request));
      await ensureWorkspaceChannel(activity.workspace);
      const publishRequest = eventFor(activity);
      await infrai.realtime.publish(publishRequest, activity.operation_id);
      const online = await infrai.realtime.presence.get(publishRequest.channel);
      return json(response, 202, { published: publishRequest.event, channel: publishRequest.channel, online });
    }

    if (request.method === "POST" && request.url === "/workspace/token") {
      const body = tokenBodySchema.parse(await readJson(request));
      await ensureWorkspaceChannel(body.workspace);
      const channel = workspaceChannel(body.workspace);
      const token = await infrai.realtime.token.issue({
        client_id: body.client_id,
        channels: [channel],
        capabilities: ["subscribe", "presence"],
        ttl_seconds: 900,
      });
      return json(response, 200, { channel, ...token });
    }

    const presenceMatch = request.url?.match(/^\/workspace\/([^/]+)\/online$/);
    if (request.method === "GET" && presenceMatch) {
      const workspace = decodeURIComponent(presenceMatch[1]);
      await ensureWorkspaceChannel(workspace);
      const channel = workspaceChannel(workspace);
      const online = await infrai.realtime.presence.get(channel);
      return json(response, 200, { channel, online });
    }

    return json(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return json(response, 400, { error: "Invalid request body" });
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.message, detail: error.detail });
    }
    return json(response, 500, { error: "Unexpected service error" });
  }
});

server.listen(env.PORT, () => {
  console.log(`Workspace presence service listening on http://localhost:${env.PORT}`);
});
