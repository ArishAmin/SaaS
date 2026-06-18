export type InsufficientCreditsDetail = {
  code: "insufficient_credits";
  message: string;
  required_credits?: number;
  balance?: number;
  plan?: string;
};

type ApiErrorLike = {
  status: number;
  message: string;
  detail?: unknown;
  name?: string;
};

const TECHNICAL_PATTERNS = [
  /^Traceback /i,
  /^HTTPError/i,
  /sqlalchemy/i,
  /postgrest/i,
  /supabase/i,
  /redis/i,
  /celery/i,
  /httpx/i,
  /exception/i,
  /errcode/i,
  /P0001/i,
  /42501/i,
  /^\{.*"detail"/,
];

const JOB_ERROR_MAP: Record<string, string> = {
  "Job timed out (worker may have crashed)":
    "This task took too long and was stopped. Please try again. Your credits were refunded.",
  "Job queue unavailable. Please try again.":
    "Our processing queue is temporarily busy. Please wait a moment and try again.",
  "Background job queue is temporarily unavailable. Credits were refunded.":
    "Our processing queue is temporarily unavailable. Your credits were refunded — please try again shortly.",
  "Canceled by user": "This task was canceled.",
  "Job disappeared after claim": "Something went wrong starting this task. Please try again.",
};

const STATUS_MESSAGES: Record<number, string> = {
  400: "We couldn't process that request. Please check your inputs and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you're looking for.",
  409: "This action can't be completed right now. Please refresh and try again.",
  429: "You're doing that too often. Please wait a moment and try again.",
  502: "Our servers are having trouble. Please try again in a few minutes.",
  503: "This feature is temporarily unavailable. Please try again shortly.",
};

function isApiError(err: unknown): err is ApiErrorLike {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as ApiErrorLike).status === "number" &&
    typeof (err as ApiErrorLike).message === "string"
  );
}

function looksTechnical(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  if (trimmed.length > 280) return true;
  return TECHNICAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function detailMessage(detail: unknown): string | undefined {
  if (!detail) return undefined;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object" && detail !== null) {
    const record = detail as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.detail === "string") return record.detail;
    if (record.code === "insufficient_credits" && typeof record.message === "string") {
      return record.message;
    }
    if (record.code === "dataset_limit" && typeof record.message === "string") {
      return record.message;
    }
    if (record.code === "company_account_required" && typeof record.message === "string") {
      return record.message;
    }
  }
  return undefined;
}

export function normalizeApiErrorMessage(status: number, rawMessage: string, detail?: unknown): string {
  const fromDetail = detailMessage(detail);
  const candidate = (fromDetail || rawMessage || "").trim();

  if (status === 402) {
    const d = detail as InsufficientCreditsDetail | undefined;
    if (d?.message) return d.message;
    return "You don't have enough credits for this action. Visit Usage & credits to see your balance.";
  }

  if (candidate && JOB_ERROR_MAP[candidate]) {
    return JOB_ERROR_MAP[candidate];
  }

  if (candidate && !looksTechnical(candidate)) {
    return candidate;
  }

  if (STATUS_MESSAGES[status]) {
    return STATUS_MESSAGES[status];
  }

  if (status >= 500) {
    return "Something went wrong on our end. Please try again in a few minutes.";
  }

  return "Something went wrong. Please try again.";
}

export function getUserFacingError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isApiError(err)) {
    return normalizeApiErrorMessage(err.status, err.message, err.detail);
  }

  if (err instanceof Error) {
    const msg = err.message.trim();

    if (JOB_ERROR_MAP[msg]) return JOB_ERROR_MAP[msg];

    if (msg.includes("timed out") || msg.includes("AbortError")) {
      return "This is taking longer than expected. It may still be running — refresh the page in a moment.";
    }

    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("backend is running")) {
      return "We couldn't reach the server. Check your internet connection and try again.";
    }

    if (!looksTechnical(msg)) {
      return msg;
    }
  }

  return fallback;
}

export function getUserFacingJobError(error?: string | null): string | undefined {
  if (!error) return undefined;
  if (JOB_ERROR_MAP[error]) return JOB_ERROR_MAP[error];
  if (!looksTechnical(error)) return error;
  return "This task didn't complete successfully. Please try again.";
}
