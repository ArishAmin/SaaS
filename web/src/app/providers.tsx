"use client";

import { Toaster } from "sonner";
import { ClientErrorLogger } from "@/components/telemetry/ClientErrorLogger";
import { PlanProvider } from "@/components/providers/PlanProvider";
import { CreditsDialogProvider } from "@/components/providers/CreditsDialogProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClientErrorLogger />
      <PlanProvider>
        <CreditsDialogProvider>{children}</CreditsDialogProvider>
      </PlanProvider>
      <Toaster richColors />
    </>
  );
}

