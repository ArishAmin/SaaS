"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  X,
  Send,
  BookOpen,
  ExternalLink,
  HelpCircle,
  Headphones,
} from "lucide-react";
import Fuse, { IFuseOptions } from "fuse.js";

import { knowledgeBase, type KBArticle } from "@/lib/knowledge-base";

/* ── Fuse.js instance (created once per mount) ──────────────────── */
const fuseOptions: IFuseOptions<KBArticle> = {
  keys: [
    { name: "title", weight: 0.5 },
    { name: "keywords", weight: 0.3 },
    { name: "content", weight: 0.2 },
  ],
  threshold: 0.5,
  ignoreLocation: true,
  includeScore: true,
  minMatchCharLength: 2,
};

/* ── Category → colour mapping ──────────────────────────────────── */
const categoryColors: Record<string, string> = {
  "Getting started": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Datasets: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "Analysis & Cleaning": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  "Insights & Modeling": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Exports & Sharing": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "Team Workspace": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  "Data Security": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  "Account & Billing": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  Troubleshooting: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  FAQ: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

/* ── Message types ──────────────────────────────────────────────── */
interface BotMessage {
  role: "bot";
  text: string;
  articles?: KBArticle[];
  isNoMatch?: boolean;
}
interface UserMessage {
  role: "user";
  text: string;
}
type Message = BotMessage | UserMessage;

const GREETING: BotMessage = {
  role: "bot",
  text: "Hi! 👋 I can help you find answers from our Help Center. Ask me anything about Acutize — like uploading datasets, cleaning data, exporting reports, or billing.",
};

const SUGGESTIONS = [
  "How do I upload a dataset?",
  "What file formats are supported?",
  "How does cleaning work?",
  "What is included in the export?",
];

/* ── Component ──────────────────────────────────────────────────── */
export function HelpChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fuseRef = useRef<Fuse<KBArticle> | null>(null);

  /* Initialise Fuse index once */
  useEffect(() => {
    fuseRef.current = new Fuse(knowledgeBase, fuseOptions);
  }, []);

  /* Scroll to bottom when messages change */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  /* Focus input when panel opens */
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  /* ── Search handler ─────────────────────────────────────────── */
  const handleSearch = useCallback(
    (rawQuery: string) => {
      if (!rawQuery.trim()) return;

      const userMsg: UserMessage = { role: "user", text: rawQuery };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsTyping(true);

      /* Simulate a small delay so the typing indicator feels natural */
      setTimeout(() => {
        const fuse = fuseRef.current;
        if (!fuse) return;

        // Simple stop-word filtering to improve Fuse.js scoring on conversational queries
        const STOP_WORDS = new Set([
          "a", "an", "the", "and", "or", "but", "how", "what", "why", "when", "where",
          "do", "i", "you", "we", "they", "is", "are", "was", "were", "to", "in", "on",
          "at", "for", "of", "with", "about", "this", "that", "it", "my", "your", "can",
          "could", "would", "should", "does", "did", "have", "has", "had", "much", "many",
          "ok", "dataset", "data", "support", "work",
        ]);
        const words = rawQuery.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/);
        const filtered = words.filter((w) => w.length > 0 && !STOP_WORDS.has(w));
        const query = filtered.length > 0 ? filtered.join(" ") : rawQuery;

        const results = fuse.search(query, { limit: 3 });

        let botReply: BotMessage;

        if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.5) {
          const articles = results.map((r) => r.item);
          botReply = {
            role: "bot",
            text:
              results.length === 1
                ? "I found this article that should help:"
                : `I found ${results.length} articles that might help:`,
            articles,
          };
        } else {
          botReply = {
            role: "bot",
            text: "I couldn't find a matching article for that question. You can browse the full Help Center for more details, or reach out to our support team and we'll be happy to help!",
            isNoMatch: true,
          };
        }

        setMessages((prev) => [...prev, botReply]);
        setIsTyping(false);
      }, 600);
    },
    [],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(input);
  };

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <>
      {/* ── Floating button ─────────────────────────────────── */}
      <button
        type="button"
        id="help-chatbot-toggle"
        aria-label={open ? "Close help assistant" : "Open help assistant"}
        onClick={() => setOpen((v) => !v)}
        className={`
          fixed bottom-5 right-5 z-[9999] flex h-14 w-14 items-center justify-center
          rounded-full shadow-lg transition-all duration-300
          ${
            open
              ? "bg-slate-800 text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 rotate-0"
              : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 hover:scale-110"
          }
        `}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {/* ── Chat panel ──────────────────────────────────────── */}
      <div
        className={`
          fixed bottom-24 right-5 z-[9998] flex flex-col
          w-[360px] max-w-[calc(100vw-40px)]
          rounded-2xl border border-slate-200 bg-white
          shadow-2xl shadow-black/15
          dark:border-slate-700 dark:bg-slate-900
          transition-all duration-300 origin-bottom-right
          ${open ? "scale-100 opacity-100 pointer-events-auto" : "scale-95 opacity-0 pointer-events-none"}
        `}
        style={{ height: "min(520px, calc(100vh - 140px))" }}
      >
        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex items-center gap-3 rounded-t-2xl border-b border-slate-200 bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4 dark:border-slate-700 dark:from-blue-700 dark:to-blue-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <HelpCircle className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">Acutize Help</p>
            <p className="text-xs text-blue-100 leading-tight">Search our help articles instantly</p>
          </div>
        </div>

        {/* ── Messages area ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" id="help-chatbot-messages">
          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-sm text-white">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex flex-col gap-2">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-2.5 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  {msg.text}
                </div>

                {/* Article cards */}
                {msg.articles?.map((article) => (
                  <Link
                    key={article.title}
                    href={article.href}
                    onClick={() => setOpen(false)}
                    className="group block rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-600"
                  >
                    <div className="flex items-start gap-2">
                      <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {article.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {article.content}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              categoryColors[article.category] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {article.category}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            Read article <ExternalLink className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}

                {/* No-match fallback actions */}
                {msg.isNoMatch && (
                  <div className="flex flex-col gap-2">
                    <Link
                      href="/help"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700 transition-all hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-600 dark:hover:text-blue-400"
                    >
                      <BookOpen className="h-4 w-4 shrink-0" />
                      Browse the Help Center
                      <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-50" />
                    </Link>
                    <Link
                      href="/dashboard/contact"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700 transition-all hover:border-blue-400 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:border-blue-600 dark:hover:bg-blue-950/50"
                    >
                      <Headphones className="h-4 w-4 shrink-0" />
                      Contact Support
                      <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-50" />
                    </Link>
                  </div>
                )}
              </div>
            ),
          )}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 dark:bg-slate-800">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 dark:bg-slate-500" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 dark:bg-slate-500" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 dark:bg-slate-500" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          {/* Quick suggestions (only show after the greeting, before user interacts) */}
          {messages.length === 1 && !isTyping && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 px-1">Quick questions:</p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSearch(s)}
                  className="w-full text-left rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-600 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input bar ───────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700"
        >
          <input
            ref={inputRef}
            id="help-chatbot-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            autoComplete="off"
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            id="help-chatbot-send"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white transition-all hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}
