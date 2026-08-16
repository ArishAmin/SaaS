import { Suspense } from "react";

import { LogoLockup } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SignupForm } from "@/components/auth/SignupForm";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Create Your Account",
  description: "Create an Acutize account to start cleaning and analyzing business datasets.",
  path: "/signup",
  noIndex: true,
});

export default function SignupPage() {
  return (
    <div className="min-h-[calc(100vh-2rem)] flex items-center justify-center px-4 py-10 bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <LogoLockup
            href="/"
            subtitle="Dataset Prep & Model Testing"
          />
          <ThemeToggle />
        </div>

        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted/40" />}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
