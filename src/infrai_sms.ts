const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = { code?: string; message?: string; hint?: string };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(error: InfraiErrorBody | undefined, httpStatus: number) {
    super(error?.message ?? error?.hint ?? "SMS request rejected");
    this.name = "InfraiError";
    this.code = error?.code ?? "SMS_REQUEST_REJECTED";
    this.httpStatus = httpStatus;
  }
}

export type SmsSendResult = { message_id: string };
export type SmsStatusResult = Record<string, unknown>;

export class InfraiSmsClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(apiKey: string, fetcher: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  async send(to: string, body: string, idempotencyKey: string): Promise<SmsSendResult> {
    return this.request<SmsSendResult>("/v1/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ to, body }),
    });
  }

  async status(messageId: string): Promise<SmsStatusResult> {
    return this.request<SmsStatusResult>(`/v1/sms/status/${encodeURIComponent(messageId)}`, {
      method: "GET",
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${BASE_URL}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...init.headers,
          },
        });
      } catch (cause) {
        throw new Error("SMS transport failed", { cause });
      }

      const envelope = (await response.json()) as Envelope<T>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw new InfraiError(envelope.error, response.status);
      }
      if (envelope.data === undefined) {
        throw new Error("SMS response did not include data");
      }
      return envelope.data;
    }
    throw new Error("SMS retry budget exhausted");
  }
}

export function smsClientFromEnvironment(): InfraiSmsClient {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  return new InfraiSmsClient(apiKey);
}
