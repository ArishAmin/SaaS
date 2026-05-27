"use client";

import { useEffect } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const defaultApiBaseUrl = "http://127.0.0.1:8001";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl;
const sessionStorageKey = "acutize_session_id";

function getClientSessionId() {
  let id = window.sessionStorage.getItem(sessionStorageKey);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(sessionStorageKey, id);
  }
  return id;
}

async function sendClientLog(payload: {
  level: string;
  event: string;
  message: string;
  stack?: string;
  page?: string;
}) {
  try {
    const {
      data: { session },
    } = await getSupabaseBrowserClient().auth.getSession();
    if (!session?.access_token) return;

    await fetch(`${apiBaseUrl}/telemetry/client-log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "X-Acutize-Session-ID": getClientSessionId(),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Never throw from logger.
  }
}

export function ClientErrorLogger() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      void sendClientLog({
        level: "error",
        event: "client_runtime_error",
        message: event.message || "Unknown client runtime error",
        stack: event.error?.stack,
        page: window.location.href,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        typeof event.reason === "string"
          ? event.reason
          : event.reason instanceof Error
            ? event.reason.message
            : "Unhandled promise rejection";
      const stack = event.reason instanceof Error ? event.reason.stack : undefined;
      void sendClientLog({
        level: "error",
        event: "client_unhandled_rejection",
        message: reason,
        stack,
        page: window.location.href,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
