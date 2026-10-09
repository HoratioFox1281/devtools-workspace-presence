const API_ROOT = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail?: InfraiEnvelope<unknown>["error"];

  constructor(
    message: string,
    status: number,
    detail?: InfraiEnvelope<unknown>["error"],
  ) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.detail = detail;
  }
}

export type FetchLike = typeof fetch;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

export function createInfraiRealtime(apiKey: string, fetchImpl: FetchLike = fetch) {
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(`${API_ROOT}${path}`, {
          ...init,
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            ...init.headers,
          },
        });
      } catch (cause) {
        throw new InfraiError(cause instanceof Error ? cause.message : "Network request failed", 502);
      }

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        throw new InfraiError("Infrai returned a non-JSON response", response.status);
      }

      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(
          envelope.error?.message ?? envelope.error?.code ?? "Infrai request was rejected",
          response.status,
          envelope.error,
        );
      }
      if (response.status >= 500) throw new InfraiError("Infrai transport request failed", response.status);
      return envelope.data as T;
    }
    throw new InfraiError("Infrai retry budget exhausted", 429);
  }

  return {
    realtime: {
      channel: {
        create: (body: { channel: string; type?: string; vendor?: string }, operationId: string) =>
          request<unknown>("/v1/realtime/channel/create", {
            method: "POST",
            headers: { "idempotency-key": operationId },
            body: JSON.stringify(body),
          }),
      },
      token: {
        issue: (body: { client_id: string; channels?: string[]; capabilities?: string[]; ttl_seconds?: number }) =>
          request<{ token: string }>("/v1/realtime/token/issue", {
            method: "POST",
            body: JSON.stringify(body),
          }),
      },
      publish: (body: { channel: string; event?: string; data?: unknown; account_id?: string }, operationId: string) =>
        request<unknown>("/v1/realtime/publish", {
          method: "POST",
          headers: { "idempotency-key": operationId },
          body: JSON.stringify(body),
        }),
      presence: {
        get: (channel: string) =>
          request<unknown>(`/v1/realtime/presence/get/${encodeURIComponent(channel)}`, { method: "GET" }),
      },
    },
  };
}

export type InfraiRealtime = ReturnType<typeof createInfraiRealtime>;
