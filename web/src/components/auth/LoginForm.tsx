"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Mail, Lock, Eye, EyeOff, Loader2, ChevronRight, AlertCircle } from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleLoginButton } from "./GoogleLoginButton";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm({ next = "/dashboard" }: { next?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword(values);
      if (error) throw error;
      if (!data.session) {
        toast.error("Could not establish a session. Confirm your email or try again.");
        return;
      }
      toast.success("Welcome back!");
      const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      router.push(safeNext);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-primary/20 bg-card/50 backdrop-blur-xl shadow-2xl overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
      
      <CardHeader className="space-y-1 pb-6">
        <CardTitle className="text-3xl font-bold tracking-tight text-center bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70">
          Welcome Back
        </CardTitle>
        <CardDescription className="text-center text-base">
          Sign in to your Acutize workspace
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
          
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
              <p className="text-[11px] font-medium text-destructive mt-1 ml-1">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" title="Forgot password" className="text-xs text-primary hover:underline underline-offset-4">
                Forgot password?
              </Link>
            </div>
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
              <p className="text-[11px] font-medium text-destructive mt-1 ml-1">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          <Button 
            type="submit" 
            className="w-full h-11 text-base font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]" 
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              "Sign In"
            )}
          </Button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background/80 backdrop-blur-sm px-3 text-muted-foreground font-medium">
                Or secure log in with
              </span>
            </div>
          </div>

          <GoogleLoginButton />

          <p className="text-center text-sm text-muted-foreground pb-2">
            New to Acutize?{" "}
            <Link href="/signup" className="text-primary font-semibold hover:underline underline-offset-4">
              Create an account
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
