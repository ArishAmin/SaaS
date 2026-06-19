"use client";

import { Suspense } from "react";
import { Toaster } from "sonner";
import { ClientErrorLogger } from "@/components/telemetry/ClientErrorLogger";
import { PlanProvider } from "@/components/providers/PlanProvider";
import { CreditsDialogProvider } from "@/components/providers/CreditsDialogProvider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import { PostHogPageView } from "@/components/providers/PostHogPageView";
import { HelpChatbot } from "@/components/help/HelpChatbot";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider>
      <Suspense>
        <PostHogPageView />
      </Suspense>
      <ClientErrorLogger />
      <PlanProvider>
        <CreditsDialogProvider>{children}</CreditsDialogProvider>
      </PlanProvider>
      <Toaster richColors />
      <HelpChatbot />
    </PostHogProvider>
  );
}

