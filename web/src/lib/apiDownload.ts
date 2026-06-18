"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ApiError, getUserFacingJobError } from "@/lib/api";
import { getUserFacingError, normalizeApiErrorMessage } from "@/lib/userErrors";

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

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }) {
  const { timeout = 120000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error: unknown) {
    clearTimeout(id);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(getUserFacingError(error, "Download timed out. The export may still be processing."));
    }
    throw error;
  }
}

export async function apiGetBlob(path: string): Promise<{ blob: Blob; contentType: string; headers: Headers }> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const authHeaders: Record<string, string> = {
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(typeof crypto !== "undefined" && "randomUUID" in crypto ? { "X-Idempotency-Key": crypto.randomUUID() } : {}),
  };
  const clientSessionId = getClientSessionId();
  if (clientSessionId) {
    authHeaders["X-Acutize-Session-ID"] = clientSessionId;
  }

  const res = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
    method: "GET",
    headers: authHeaders,
    timeout: 120000,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || `Download failed (${res.status})`;
    let detail: unknown;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (parsed?.detail !== undefined) {
        detail = parsed.detail;
        message = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
      }
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, normalizeApiErrorMessage(res.status, message, detail), detail);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const text = await res.text();
    const parsed = JSON.parse(text) as {
      job_id?: string;
      queued?: boolean;
      status?: string;
      result_json?: { download_url?: string };
    };
    if (
      parsed.job_id &&
      (parsed.queued || parsed.status === "queued" || parsed.status === "running")
    ) {
      const downloadPath = await pollDownloadPath(parsed.job_id, authHeaders);
      const download = await fetchWithTimeout(`${apiBaseUrl}${downloadPath}`, {
        method: "GET",
        headers: authHeaders,
        timeout: 120000,
      });
      if (!download.ok) {
        throw new ApiError(
          download.status,
          normalizeApiErrorMessage(
            download.status,
            (await download.text().catch(() => "")) || `Download failed (${download.status})`,
          ),
        );
      }
      return {
        blob: await download.blob(),
        contentType: download.headers.get("content-type") ?? "",
        headers: download.headers,
      };
    }
    return { blob: new Blob([text], { type: contentType }), contentType, headers: res.headers };
  }

  return { blob: await res.blob(), contentType, headers: res.headers };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollDownloadPath(jobId: string, headers: Record<string, string>) {
  const started = Date.now();
  while (Date.now() - started < 180000) {
    const res = await fetchWithTimeout(`${apiBaseUrl}/jobs/${jobId}`, {
      method: "GET",
      headers,
      timeout: 30000,
    });
    if (!res.ok) {
      throw new ApiError(
        res.status,
        normalizeApiErrorMessage(res.status, (await res.text().catch(() => "")) || `Job status failed (${res.status})`),
      );
    }
    const job = (await res.json()) as {
      status?: string;
      error?: string | null;
      result_json?: { download_url?: string };
    };
    if (job.status === "completed" && job.result_json?.download_url) {
      return job.result_json.download_url;
    }
    if (job.status === "failed" || job.status === "canceled") {
      throw new ApiError(
        500,
        getUserFacingJobError(job.error) || "This export didn't complete. Please try again.",
        job,
      );
    }
    await sleep(1500);
  }
  throw new Error(getUserFacingError(null, "This export is still running. Please try again in a moment."));
}
