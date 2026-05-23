"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/providers/PlanProvider";
import { isBillingEnforcementEnabled } from "@/lib/billing";
import { PLANS } from "@/lib/plans";

type CreditsDialogPayload = {
  message: string;
  required?: number;
  balance?: number;
  plan?: string;
};

type CreditsDialogContextValue = {
  showUpgrade: (payload?: CreditsDialogPayload) => void;
};

const CreditsDialogContext = createContext<CreditsDialogContextValue | undefined>(undefined);

export function CreditsDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<CreditsDialogPayload | null>(null);
  const { plan, creditsBalance, creditsQuota, refreshPlan } = usePlan();
  const enforcement = isBillingEnforcementEnabled();

  const showUpgrade = useCallback((p?: CreditsDialogPayload) => {
    setPayload(
      p ?? {
        message: "You need more credits to run this action.",
        balance: creditsBalance,
      }
    );
    setOpen(true);
  }, [creditsBalance]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<CreditsDialogPayload>;
      void refreshPlan();
      showUpgrade(ce.detail);
    };
    window.addEventListener("acutize:insufficient-credits", handler);
    return () => window.removeEventListener("acutize:insufficient-credits", handler);
  }, [showUpgrade, refreshPlan]);

  const proPlan = PLANS.find((p) => p.id === "pro");
  const businessPlan = PLANS.find((p) => p.id === "business");

  return (
    <CreditsDialogContext.Provider value={{ showUpgrade }}>
      {children}
      {enforcement ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                More credits needed
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3 text-left text-sm text-muted-foreground pt-1">
                  <p>{payload?.message ?? "Upgrade to keep using paid pipeline steps."}</p>
                  <p>
                    Your balance:{" "}
                    <strong className="text-foreground">
                      {payload?.balance ?? creditsBalance} / {creditsQuota}
                    </strong>{" "}
                    credits
                    {plan === "hobby" ? " (one-time free pack — upgrade for monthly refills)" : ""}.
                  </p>
                  {payload?.required != null ? (
                    <p>
                      This action needs <strong>{payload.required}</strong> credits.
                    </p>
                  ) : null}
                  <ul className="list-disc pl-5 space-y-1 text-foreground/80">
                    <li>
                      <strong>Pro (${proPlan?.priceMonthly}/mo):</strong> {proPlan?.monthlyCredits}{" "}
                      credits/month, 12 datasets, 30 MB files, more models
                    </li>
                    <li>
                      <strong>Business (${businessPlan?.priceMonthly}/mo):</strong>{" "}
                      {businessPlan?.monthlyCredits} credits/month, unlimited datasets, 75 MB files
                    </li>
                  </ul>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/dashboard/settings/credits">View usage</Link>
              </Button>
              <Button asChild className="w-full sm:w-auto">
                <Link href="/pricing">See plans & upgrade</Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </CreditsDialogContext.Provider>
  );
}

export function useCreditsDialog() {
  const ctx = useContext(CreditsDialogContext);
  if (!ctx) {
    throw new Error("useCreditsDialog must be used within CreditsDialogProvider");
  }
  return ctx;
}
