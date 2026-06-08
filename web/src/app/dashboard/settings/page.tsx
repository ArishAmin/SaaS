"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StepHint } from "@/components/ui/step-hint";
import { isBillingEnforcementEnabled } from "@/lib/billing";
import { apiRequest } from "@/lib/api";

type ProfileResponse = {
  plan?: string | null;
  subscription_status?: string | null;
  credits_balance?: number | null;
  credits_quota?: number | null;
  credits_monthly_quota?: number | null;
  credits_period_end?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadUser() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!mounted || !data.user) return;

        setName((data.user.user_metadata?.full_name as string | undefined) ?? "");
        setEmail(data.user.email ?? "");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load profile";
        toast.error(message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  async function onSaveProfile() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Name must be at least 2 characters.");
      return;
    }
    if (!email.includes("@")) {
      toast.error("Please enter a valid email.");
      return;
    }

    setSavingProfile(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({
        email,
        data: { full_name: trimmed },
      });
      if (error) throw error;
      toast.success("Profile updated. If email changed, verify it from your inbox.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Profile update failed";
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function onSavePassword() {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Password confirmation does not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated successfully.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Password update failed";
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-foreground/70 mt-1">Manage your account profile and security preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your name and email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StepHint>
            Your name appears in the dashboard sidebar. If you change your email, we may require email
            verification before it becomes active.
          </StepHint>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading || savingProfile}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || savingProfile}
                placeholder="you@company.com"
              />
            </div>
          </div>
          <Button onClick={onSaveProfile} disabled={loading || savingProfile}>
            {savingProfile ? "Saving..." : "Save profile"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Change your account password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={savingPassword}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={savingPassword}
                autoComplete="new-password"
              />
            </div>
          </div>
          <Button onClick={onSavePassword} disabled={savingPassword}>
            {savingPassword ? "Updating..." : "Update password"}
          </Button>
        </CardContent>
      </Card>

      <SubscriptionCard />

      <Card>
        <CardHeader>
          <CardTitle>Usage & credits</CardTitle>
          <CardDescription>
            View your balance, plan limits, credit costs, and transaction history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href="/dashboard/settings/credits">Open usage dashboard</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SubscriptionCard() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const data = await apiRequest<ProfileResponse>("/profiles/me");
        setProfile(data);
      } catch (err) {
        console.error("Failed to load profile", err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  const handleManage = async () => {
    setPortalLoading(true);
    try {
      const res = await apiRequest<{ url: string }>("/billing/customer-portal", {
        method: "POST",
        body: { return_url: `${window.location.origin}/dashboard/settings` },
      });
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to open billing portal";
      toast.error(message);
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return (
    <Card className="animate-pulse">
        <CardHeader><div className="h-6 w-32 bg-slate-200 rounded" /></CardHeader>
        <CardContent><div className="h-20 bg-slate-100 rounded" /></CardContent>
    </Card>
  );

  const enforcement = isBillingEnforcementEnabled();
  const plan = profile?.plan || "hobby";
  const status = profile?.subscription_status || "none";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
        <CardDescription>Manage your current plan and billing details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-800">
          <div>
            <div className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Current Plan</div>
            <div className="flex items-center gap-2">
                <span className="text-2xl font-bold capitalize">{plan}</span>
                {status !== "active" && status !== "none" && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-100 text-yellow-700 border border-yellow-200">
                        {status.replace("_", " ")}
                    </span>
                )}
            </div>
          </div>
          <div className="flex gap-3">
            {!enforcement && process.env.NODE_ENV === "development" ? (
              <p className="text-sm text-muted-foreground self-center">Billing enforcement off (local dev).</p>
            ) : plan === "hobby" ? (
              <Button asChild variant="default">
                <a href="/pricing">Upgrade Plan</a>
              </Button>
            ) : (
              <Button onClick={handleManage} disabled={portalLoading} variant="outline">
                {portalLoading ? "Loading..." : "Manage Billing"}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Status</div>
                <div className="font-medium capitalize">{status === "none" ? "Free Tier" : status}</div>
            </div>
            <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Credits remaining</div>
                <div className="font-medium">
                  {profile?.credits_balance ?? "—"}
                  <span className="text-slate-400 font-normal">
                    {" "}/ {profile?.credits_quota ?? profile?.credits_monthly_quota ?? "—"}
                  </span>
                </div>
            </div>
            {profile?.credits_period_end && (
              <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Credits reset</div>
                <div className="font-medium">
                  {new Date(profile.credits_period_end).toLocaleDateString()}
                </div>
              </div>
            )}
            {profile?.current_period_end && (
                 <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500 mb-1">Next billing date</div>
                    <div className="font-medium">
                        {new Date(profile.current_period_end).toLocaleDateString()}
                    </div>
                </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
