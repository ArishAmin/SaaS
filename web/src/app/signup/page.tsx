import { LogoLockup } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SignupForm } from "@/components/auth/SignupForm";

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

        <SignupForm />
      </div>
    </div>
  );
}

