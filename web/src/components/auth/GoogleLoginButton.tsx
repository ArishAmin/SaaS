"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

interface GoogleLoginButtonProps {
  onSuccess?: () => void;
  text?: string;
}

declare global {
  interface Window {
    google: any;
  }
}

export function GoogleLoginButton({ onSuccess, text = "Continue with Google" }: GoogleLoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const googleInitialized = useRef(false);

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
  }, []);

  const handleCredentialResponse = async (response: any) => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
      });

      if (error) throw error;

      toast.success("Signed in successfully!");
      if (onSuccess) onSuccess();
      
      // Redirect to dashboard on success
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

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
