"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { User, Loader2, Sparkles } from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(50, "Name too long."),
});

type ProfileValues = z.infer<typeof profileSchema>;

export function FillProfileForm() {
  const [loading, setLoading] = useState(false);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "" },
  });

  async function onSubmit(values: ProfileValues) {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      
      // Update user metadata with the full name
      const { error } = await supabase.auth.updateUser({
        data: { full_name: values.name }
      });

      if (error) throw error;

      toast.success("Profile updated! Welcome aboard.");
      
      // Force a full refresh to clear the gate
      window.location.reload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update profile";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-md border-primary/20 bg-card/50 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-primary/50 to-primary" />
        
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="rounded-2xl bg-primary/10 p-3 ring-1 ring-primary/20">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Welcome to Acutize!</CardTitle>
          <CardDescription>
            Just one last thing—what should we call you?
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Your Full Name</Label>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  id="name"
                  placeholder="John Doe"
                  className="pl-10 bg-background/50 focus-visible:ring-primary/30 h-12 text-lg"
                  {...form.register("name")}
                />
              </div>
              {form.formState.errors.name && (
                <p className="text-xs font-medium text-destructive mt-1 animate-in slide-in-from-top-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-lg font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-primary/10"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Finish Setup"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
