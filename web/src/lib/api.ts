"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getUserFacingError, getUserFacingJobError, normalizeApiErrorMessage } from "@/lib/userErrors";
import type { InsufficientCreditsDetail } from "@/lib/userErrors";

const defaultApiBaseUrl = "http://127.0.0.1:8001";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl;
const sessionStorageKey = "acutize_session_id";

function getClientSessionId() {
  if (typeof window === "undefined") return undefined;
  let id = window.sessionStorage.getItem(sessionStorageKey);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(sessionStorageKey, id);
  }
  return id;
}

export type { InsufficientCreditsDetail } from "@/lib/userErrors";
export { getUserFacingError, getUserFacingJobError, normalizeApiErrorMessage } from "@/lib/userErrors";

export class ApiError extends Error {
  status: number;
  detail?: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function isInsufficientCreditsError(err: unknown): err is ApiError {
  if (!(err instanceof ApiError) || err.status !== 402) return false;
  const d = err.detail as InsufficientCreditsDetail | undefined;
  return !d?.code || d.code === "insufficient_credits";
}

export function dispatchInsufficientCredits(err: ApiError) {
  if (typeof window === "undefined") return;
  const d = err.detail as InsufficientCreditsDetail | undefined;
  window.dispatchEvent(
    new CustomEvent("acutize:insufficient-credits", {
      detail: {
        message: d?.message ?? err.message,
        required: d?.required_credits,
        balance: d?.balance,
        plan: d?.plan,
      },
    })
  );
}

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }) {
  const { timeout = 60000, ...fetchOptions } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error: unknown) {
    clearTimeout(id);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Request timed out. The server is still processing your request, but the connection was closed."
      );
    }
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type JobEnvelope = {
  job_id?: string;
  status?: "queued" | "running" | "completed" | "failed" | "canceled";
  queued?: boolean;
  result_json?: unknown;
  error?: string | null;
};

function isQueuedJob(value: unknown): value is JobEnvelope {
  if (typeof value !== "object" || value === null || !("job_id" in value)) {
    return false;
  }
  const envelope = value as JobEnvelope;
  const status = envelope.status;
  if (status === "completed" || status === "failed" || status === "canceled") {
    return false;
  }
  return (
    envelope.queued === true ||
    status === "queued" ||
    status === "running"
  );
}

function isCompletedJob(value: unknown): value is JobEnvelope & { result_json: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as JobEnvelope).status === "completed" &&
    "result_json" in value
  );
}

async function pollJobResult<T>(jobId: string, accessToken: string | undefined, timeoutMs: number): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${apiBaseUrl}/jobs/${jobId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        "X-Acutize-Session-ID": getClientSessionId() ?? "",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new ApiError(
        res.status,
        normalizeApiErrorMessage(res.status, text || `Job status failed (${res.status})`),
      );
    }
    const job = JSON.parse(text) as JobEnvelope;
    if (job.status === "completed") {
      return job.result_json as T;
    }
    if (job.status === "failed" || job.status === "canceled") {
      throw new ApiError(
        500,
        getUserFacingJobError(job.error) || "This task didn't complete. Please try again.",
        job,
      );
    }
    await sleep(1500);
  }
  throw new Error("This job is still running. Please check the page again in a moment.");
}

async function sendApiErrorLog(
  accessToken: string | undefined,
  path: string,
  status: number,
  message: string
) {
  if (!accessToken) return;
  try {
    await fetch(`${apiBaseUrl}/telemetry/client-log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Acutize-Session-ID": getClientSessionId() ?? "",
      },
      body: JSON.stringify({
        level: "error",
        event: "client_api_error",
        message,
        page: typeof window !== "undefined" ? window.location.href : undefined,
        stack: `path=${path};status=${status}`,
      }),
    });
  } catch {
    // Best effort.
  }
}

export async function apiRequest<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    timeout?: number;
  }
): Promise<T> {
  const { method = "GET", body, timeout } = options ?? {};

  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const clientSessionId = getClientSessionId();
  if (clientSessionId) {
    headers["X-Acutize-Session-ID"] = clientSessionId;
  }
  if (method !== "GET" && typeof crypto !== "undefined" && "randomUUID" in crypto) {
    headers["X-Idempotency-Key"] = crypto.randomUUID();
  }

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  } else {
    const isDashboard =
      typeof window !== "undefined" && window.location.pathname.startsWith("/dashboard");
    if (isDashboard) {
      console.warn(`[api] Missing session for request to ${path}. User might need to re-login.`);
    }
  }

  const url = `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      timeout:
        timeout ??
        (path.includes("/analyze") ||
        path.includes("/clean") ||
        path.includes("/train-quick") ||
        path.includes("/recommend") ||
        path.includes("/forecasting") ||
        path.includes("/business-insights") ||
        path.includes("/eda") ||
        path.includes("/quality") ||
        path.includes("/feature-engineer") ||
        path.includes("/report/pdf") ||
        path.includes("/export")
          ? 120000
          : 30000),
    });
  } catch (err: unknown) {
    console.error(`[api] Network Error fetching ${url}:`, err);
    throw new Error(
      getUserFacingError(err, "We couldn't reach the server. Check your connection and try again."),
    );
  }

  const text = await res.text();
  if (!res.ok) {
    let message = text || `Request failed (${res.status})`;
    let detail: unknown;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (parsed?.detail !== undefined) {
        detail = parsed.detail;
        if (typeof parsed.detail === "string") {
          message = parsed.detail;
        } else if (typeof parsed.detail === "object" && parsed.detail !== null) {
          const d = parsed.detail as { message?: string };
          message = d.message ?? JSON.stringify(parsed.detail);
        }
      }
    } catch {
      /* not JSON */
    }
    await sendApiErrorLog(session?.access_token, path, res.status, message);
    const friendly = normalizeApiErrorMessage(res.status, message, detail);
    const apiErr = new ApiError(res.status, friendly, detail);
    if (res.status === 402) {
      dispatchInsufficientCredits(apiErr);
    }
    throw apiErr;
  }

  if (!text) return undefined as T;
  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    parsed = text as unknown as T;
  }

  if (isCompletedJob(parsed)) {
    return parsed.result_json as T;
  }

  if (isQueuedJob(parsed) && parsed.job_id && !path.startsWith("/jobs/")) {
    parsed = await pollJobResult<T>(parsed.job_id, session?.access_token, timeout ?? 180000);
  }

  if (
    typeof window !== "undefined" &&
    method !== "GET" &&
    process.env.NEXT_PUBLIC_BILLING_ENFORCEMENT_ENABLED === "true"
  ) {
    window.dispatchEvent(new CustomEvent("acutize:credits-updated"));
  }

  return parsed;
}
