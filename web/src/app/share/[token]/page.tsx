"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SharedResponse = {
  token: string;
  created_at?: string;
  snapshot: unknown;
};

function safeJson(x: unknown) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

export default function SharedReportPage({ params }: { params: { token: string } }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SharedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/shared/${params.token}`);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Failed (${res.status})`);
        }
        const json = (await res.json()) as SharedResponse;
        if (!mounted) return;
        setData(json);
      } catch (e: unknown) {
        if (!mounted) return;
        const message = e instanceof Error ? e.message : "Failed to load shared report";
        setError(message);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [apiBaseUrl, params.token]);

  const snapshot = useMemo(() => data?.snapshot ?? null, [data]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black px-4 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Shared Acutize Report</h1>
          <p className="text-sm text-foreground/70 mt-1">Read-only snapshot (no login required).</p>
        </div>

        {loading ? (
          <Card>
            <CardHeader>
              <CardTitle>Loading...</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <Card>
            <CardHeader>
              <CardTitle>Not available</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {snapshot ? (
          <Card>
            <CardHeader>
              <CardTitle>Snapshot</CardTitle>
              <CardDescription>
                Token: {data?.token} {data?.created_at ? `• Created: ${data.created_at}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs overflow-auto rounded-md border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/20 p-3">
                {safeJson(snapshot)}
              </pre>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

