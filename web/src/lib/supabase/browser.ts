"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Browser Supabase client that syncs auth to cookies so App Router server components
 * (e.g. dashboard layout) can read the same session after login.
 */
export function getSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (!client) {
    client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  return client;
}

