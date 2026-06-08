"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

interface GoogleLoginButtonProps {
  onSuccess?: () => void;
  text?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id?: string; callback: (response: GoogleCredentialResponse) => void }) => void;
          renderButton: (
            element: HTMLElement,
            options: { theme: string; size: string; width: number; text: string; shape: string }
          ) => void;
        };
      };
    };
  }
}

type GoogleCredentialResponse = {
  credential: string;
};

export function GoogleLoginButton({ onSuccess }: GoogleLoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const googleInitialized = useRef(false);

  const handleCredentialResponse = useCallback(async (response: GoogleCredentialResponse) => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
      });

      if (error) throw error;

      toast.success("Signed in successfully!");
      if (onSuccess) onSuccess();

      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  useEffect(() => {
    const initializeGoogle = () => {
      if (!window.google || !buttonRef.current || googleInitialized.current) return;
      googleInitialized.current = true;
      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: buttonRef.current.offsetWidth || 340,
        text: "continue_with",
        shape: "pill",
      });
    };

    // Retry initialization if script isn't loaded yet
    const interval = setInterval(() => {
      if (window.google) {
        initializeGoogle();
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [handleCredentialResponse]);

  return (
    <div className="relative w-full min-h-[44px]">
      <div 
        ref={buttonRef} 
        className={`w-full ${loading ? "invisible" : "visible"}`}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-lg border border-primary/20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
