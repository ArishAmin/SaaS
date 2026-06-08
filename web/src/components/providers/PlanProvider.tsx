"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { PlanId } from "@/lib/plans";

interface PlanContextType {
  plan: PlanId;
  status: string;
  creditsBalance: number;
  creditsQuota: number;
  creditsRefreshMode: "one_time" | "monthly" | null;
  loading: boolean;
  refreshPlan: () => Promise<void>;
}

const PlanContext = createContext<PlanContextType | undefined>(undefined);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<PlanId>("hobby");
  const [status, setStatus] = useState("none");
  const [creditsBalance, setCreditsBalance] = useState(60);
  const [creditsQuota, setCreditsQuota] = useState(60);
  const [creditsRefreshMode, setCreditsRefreshMode] = useState<"one_time" | "monthly" | null>("one_time");
  const [loading, setLoading] = useState(true);

  const fetchPlan = async () => {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setPlan("hobby");
      setStatus("none");
      setCreditsBalance(60);
      setCreditsQuota(60);
      setLoading(false);
      return;
    }

    try {
      const profile = await apiRequest<{
        plan?: string;
        subscription_status?: string;
        credits_balance?: number;
        credits_quota?: number;
        credits_monthly_quota?: number;
        credits_refresh_mode?: "one_time" | "monthly";
      }>("/profiles/me");

      setPlan((profile?.plan || "hobby") as PlanId);
      setStatus(profile?.subscription_status || "none");
      setCreditsBalance(profile?.credits_balance ?? 60);
      setCreditsQuota(profile?.credits_quota ?? profile?.credits_monthly_quota ?? 60);
      setCreditsRefreshMode(profile?.credits_refresh_mode ?? "one_time");
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[PlanProvider] Could not load plan", err);
      }
      setPlan("hobby");
      setStatus("none");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlan();
    const supabase = getSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void fetchPlan();
    });
    const onCreditsUpdated = () => void fetchPlan();
    window.addEventListener("acutize:credits-updated", onCreditsUpdated);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("acutize:credits-updated", onCreditsUpdated);
    };
  }, []);

  return (
    <PlanContext.Provider
      value={{
        plan,
        status,
        creditsBalance,
        creditsQuota,
        creditsRefreshMode,
        loading,
        refreshPlan: fetchPlan,
      }}
    >
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const context = useContext(PlanContext);
  if (context === undefined) {
    throw new Error("usePlan must be used within a PlanProvider");
  }
  return context;
}
