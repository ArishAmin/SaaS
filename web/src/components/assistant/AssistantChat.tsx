"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ChatMsg = { role: "user" | "assistant"; content: string };

export function AssistantChat({ initialDatasetId }: { initialDatasetId?: string }) {
  const [datasetId, setDatasetId] = useState(initialDatasetId ?? "");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Ask me about your dataset quality, cleaning choices, feature engineering, or how to improve metrics. If you paste a datasetId, I can be dataset-aware.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const history = useMemo(
    () => messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-20),
    [messages]
  );

  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  async function send() {
    const text = draft.trim();
    if (!text) return;

    setDraft("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await apiRequest<{ reply: string }>("/assistant/chat", {
        method: "POST",
        body: {
          dataset_id: datasetId.trim() ? datasetId.trim() : null,
          message: text,
          history: history.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
      setTimeout(scrollToBottom, 0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Assistant request failed";
      toast.error(message);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 0);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Assistant</CardTitle>
        <CardDescription>Secure, rate-limited, and optionally dataset-aware.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Optional datasetId (UUID) for dataset-aware help"
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => setMessages([{ role: "assistant", content: "Chat cleared. How can I help?" }])}
            disabled={loading}
          >
            Clear
          </Button>
        </div>

        <div
          ref={scrollRef}
          className="h-[420px] overflow-auto rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/20 p-3 space-y-3"
        >
          {messages.map((m, idx) => (
            <div key={idx} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-lg bg-foreground text-background px-3 py-2 text-sm whitespace-pre-wrap"
                    : "max-w-[85%] rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 text-sm whitespace-pre-wrap"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            className="flex-1 min-h-[44px] max-h-40 resize-y rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/30"
            placeholder="Ask a question…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button onClick={send} disabled={loading}>
            {loading ? "Thinking..." : "Send"}
          </Button>
        </div>

        <p className="text-xs text-foreground/60">
          Tip: press Ctrl+Enter to send. Add a datasetId from the URL (for example, from Analyzer) to get
          dataset-aware suggestions.
        </p>
      </CardContent>
    </Card>
  );
}

