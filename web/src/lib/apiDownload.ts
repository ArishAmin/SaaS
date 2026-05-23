"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const defaultApiBaseUrl = "http://127.0.0.1:8001";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl;

export async function apiGetBlob(path: string): Promise<{ blob: Blob; contentType: string; headers: Headers }> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: "GET",
    headers: {
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || `Download failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (parsed?.detail !== undefined) {
        message = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
      }
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }

  return { blob: await res.blob(), contentType: res.headers.get("content-type") ?? "", headers: res.headers };
}

