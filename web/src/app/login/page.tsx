import { LogoLockup } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { LoginForm } from "@/components/auth/LoginForm";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Log In",
  description: "Log in to your private Acutize data workspace.",
  path: "/login",
  noIndex: true,
});

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
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

        <LoginForm next={next} />
      </div>
    </div>
  );
}
