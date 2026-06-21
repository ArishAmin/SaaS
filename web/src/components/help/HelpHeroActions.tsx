"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, LayoutGrid, Mail } from "lucide-react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function HelpHeroActions() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      if (!mounted) return;
      setSession(result.data.session);
      setLoaded(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession: Session | null) => {
      setSession(nextSession);
      setLoaded(true);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signedIn = loaded && !!session;
  const contactHref = "/contact";

  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Button asChild>
        <Link href={signedIn ? "/dashboard" : "/signup"}>
          {signedIn ? "Go to dashboard" : "Start free"}
          {signedIn ? <LayoutGrid className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href={contactHref}>
          Contact support <Mail className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
