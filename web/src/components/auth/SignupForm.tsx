"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { User, Mail, Lock, Eye, EyeOff, Loader2, CheckCircle2, ChevronRight } from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GoogleLoginButton } from "./GoogleLoginButton";
import { cn } from "@/lib/utils";

const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters."),
    email: z.string().email("Please enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Confirm password is required."),
    acceptedTOS: z.boolean().refine((val) => val === true, {
      message: "You must accept the terms and conditions.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupValues = z.infer<typeof signupSchema>;

export function SignupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [awaitingEmail, setAwaitingEmail] = useState<{ email: string } | null>(null);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", acceptedTOS: false },
  });

  const acceptedTOS = form.watch("acceptedTOS");

  async function onSubmit(values: SignupValues) {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/dashboard`;
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            full_name: values.name,
          },
        },
      });

      if (error) throw error;

      // Duplicate Check: Supabase returns a 'user' but empty 'identities' if the email exists
      // and "Enable email confirmations" is turned ON.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        toast.error("This email is already registered.", {
          duration: 6000,
        });
        setLoading(false);
        return;
      }

      if (data.session) {
        toast.success("Account created!");
        router.push("/dashboard");
        router.refresh();
        return;
      }

      setAwaitingEmail({ email: values.email });
      toast.success("Verification email sent!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Signup failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (awaitingEmail) {
    return (
      <Card className="w-full max-w-md border-primary/20 bg-card/50 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in duration-300">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 p-3 ring-8 ring-primary/5">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Verify your email</CardTitle>
          <CardDescription>
            We've sent a link to <span className="font-semibold text-foreground">{awaitingEmail.email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 text-sm text-foreground/80 leading-relaxed text-center">
            Please check your inbox (and spam folder) for a confirmation link to activate your account.
          </div>
          <Button variant="outline" className="w-full group" onClick={() => setAwaitingEmail(null)}>
            Change email address
            <ChevronRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </CardContent>
        <CardFooter>
          <p className="text-xs text-center w-full text-muted-foreground">
            After verifying, you can return here to log in.
          </p>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-primary/20 bg-card/50 backdrop-blur-xl shadow-2xl overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />

      <CardHeader className="space-y-1 pb-6">
        <CardTitle className="text-3xl font-bold tracking-tight text-center bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70">
          Create Account
        </CardTitle>
        <CardDescription className="text-center text-base">
          Join the future of ML data preparation
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <div className="relative group">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                id="name"
                placeholder="John Doe"
                className="pl-10 bg-background/50 focus-visible:ring-primary/30"
                {...form.register("name")}
              />
            </div>
            {form.formState.errors.name && (
              <p className="text-[11px] font-medium text-destructive mt-1 ml-1 animate-in slide-in-from-top-1">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative group">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                className="pl-10 bg-background/50 focus-visible:ring-primary/30"
                {...form.register("email")}
              />
            </div>
            {form.formState.errors.email && (
              <p className="text-[11px] font-medium text-destructive mt-1 ml-1 leading-none">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="pl-10 pr-10 bg-background/50 focus-visible:ring-primary/30"
                {...form.register("password")}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {form.formState.errors.password && (
              <p className="text-[11px] font-medium text-destructive mt-1 ml-1 leading-none">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="pl-10 pr-10 bg-background/50 focus-visible:ring-primary/30"
                {...form.register("confirmPassword")}
              />
            </div>
            {form.formState.errors.confirmPassword && (
              <p className="text-[11px] font-medium text-destructive mt-1 ml-1 leading-none">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          <div className="flex items-start space-x-3 mt-1 px-1">
            <Checkbox
              id="acceptedTOS"
              checked={acceptedTOS}
              onChange={(e) => form.setValue("acceptedTOS", e.target.checked)}
              className="mt-0.5"
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="acceptedTOS"
                className="text-xs font-medium text-muted-foreground leading-snug cursor-pointer select-none"
              >
                I agree to the{" "}
                <Link href="/terms" className="text-primary hover:underline underline-offset-4">Terms</Link>
                {" "}and{" "}
                <Link href="/privacy" className="text-primary hover:underline underline-offset-4">Privacy</Link>
              </label>
              {form.formState.errors.acceptedTOS && (
                <p className="text-[10px] text-destructive font-medium">
                  {form.formState.errors.acceptedTOS.message}
                </p>
              )}
            </div>
          </div>

          <Button
            type="submit"
            className={cn(
              "w-full h-11 text-base font-semibold transition-all transition-transform active:scale-[0.98]",
              !acceptedTOS && "opacity-50 grayscale cursor-not-allowed hover:grayscale-0"
            )}
            disabled={loading || !acceptedTOS}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              "Get Started"
            )}
          </Button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background/80 backdrop-blur-sm px-3 text-muted-foreground font-medium">
                Or secure join with
              </span>
            </div>
          </div>

          <GoogleLoginButton />

          <p className="text-center text-sm text-muted-foreground pb-2">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline underline-offset-4">
              Sign In
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
