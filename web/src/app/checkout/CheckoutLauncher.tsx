"use client";

import Script from "next/script";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";

type PaddleCheckoutEvent = {
  name?: string;
  type?: string;
  data?: unknown;
};

type PaddleClient = {
  Environment?: {
    set: (environment: "sandbox" | "production") => void;
  };
  Initialize: (options: {
    token: string;
    eventCallback?: (event: PaddleCheckoutEvent) => void;
  }) => void;
  Checkout: {
    open: (options: {
      transactionId: string;
      settings?: {
        displayMode?: "overlay" | "inline";
        variant?: "one-page" | "multi-page";
        theme?: "light" | "dark";
        locale?: string;
        successUrl?: string;
      };
    }) => void;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleClient;
  }
}

const paddleToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
const paddleEnvironment = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox";

export function CheckoutLauncher() {
  const searchParams = useSearchParams();
  const transactionId = searchParams.get("_ptxn") ?? searchParams.get("transaction_id");
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [redirectingToDashboard, setRedirectingToDashboard] = useState(false);
  const openedRef = useRef(false);
  const setupError = !transactionId
    ? "Missing checkout transaction."
    : !paddleToken
      ? "Paddle checkout is missing its client-side token."
      : null;

  useEffect(() => {
    if (!scriptReady || openedRef.current || setupError) return;
    if (!window.Paddle) {
      queueMicrotask(() => setError("Paddle checkout did not load."));
      return;
    }
    const token = paddleToken;
    if (!token) return;
    const checkoutTransactionId = transactionId;
    if (!checkoutTransactionId) return;

    openedRef.current = true;

    try {
      if (paddleEnvironment === "sandbox") {
        window.Paddle.Environment?.set("sandbox");
      }

      window.Paddle.Initialize({
        token,
        eventCallback: (event) => {
          const eventName = event.name ?? event.type;
          if (eventName === "checkout.error") {
            setError("Paddle could not open this checkout.");
          }
          if (eventName?.includes("completed")) {
            setCompleted(true);
            setRedirectingToDashboard(true);
            window.setTimeout(() => {
              window.location.assign("/dashboard?checkout=success");
            }, 800);
          }
          if (eventName === "checkout.closed") {
            setRedirectingToDashboard(true);
            window.setTimeout(() => {
              window.location.assign("/dashboard");
            }, 500);
          }
        },
      });

      window.Paddle.Checkout.open({
        transactionId: checkoutTransactionId,
        settings: {
          displayMode: "overlay",
          variant: "one-page",
          theme: "light",
          locale: "en",
          successUrl: `${window.location.origin}/dashboard?checkout=success`,
        },
      });
    } catch (err) {
      openedRef.current = false;
      queueMicrotask(() => {
        setError(err instanceof Error ? err.message : "Unable to open Paddle checkout.");
      });
    }
  }, [scriptReady, setupError, transactionId]);

  useEffect(() => {
    const onPageHide = () => {
      setRedirectingToDashboard(true);
    };

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  const visibleError = setupError ?? error;

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => setError("Paddle checkout script could not be loaded.")}
      />

      <section className="w-full max-w-sm text-center">
        {visibleError ? (
          <>
            <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-red-500/15 text-red-300">
              <AlertCircle className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold">Checkout could not open</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">{visibleError}</p>
            <Link
              href="/pricing"
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to pricing
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-blue-500/15 text-blue-300">
              {scriptReady ? <ShieldCheck className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
            </div>
            <h1 className="text-xl font-semibold">
              {redirectingToDashboard ? "Redirecting to dashboard" : "Opening secure checkout"}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {redirectingToDashboard
                ? completed
                  ? "Your payment is complete. Taking you back to your workspace."
                  : "Taking you back to your workspace."
                : "You will be redirected after payment succeeds."}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
