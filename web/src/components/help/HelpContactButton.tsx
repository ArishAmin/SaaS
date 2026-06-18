"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function HelpContactButton() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then((result) => setSession(result.data.session));
    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const href = session ? "/dashboard/contact" : "/login?next=/dashboard/contact";

  return (
    <Button asChild>
      <Link href={href}>
        Contact support <Mail className="h-4 w-4" />
      </Link>
    </Button>
  );
}
