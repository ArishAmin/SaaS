"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  Check,
  Coins,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  Shield,
  Sparkles,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { apiRequest, getUserFacingError, getUserFacingJobError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CompanyAccount = {
  enabled?: boolean;
  organization_id?: string;
  organization_name?: string;
  owner_user_id?: string;
  is_owner?: boolean;
  member_count?: number;
  pending_invitations?: number;
  plan?: string;
  role?: string;
  can_manage_members?: boolean;
  can_manage_billing?: boolean;
  can_update_member_roles?: boolean;
  credits_balance?: number;
  credits_monthly_quota?: number;
};

type Member = {
  user_id: string;
  role: string;
  status: string;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  invited_email?: string | null;
  created_at?: string;
};

type Invitation = {
  invitation_id: string;
  email: string;
  role: string;
  status: string;
  expires_at?: string;
};

type ProcessingJob = {
  job_id: string;
  action: string;
  status: string;
  error?: string | null;
  queued_at?: string;
};

const ACTION_LABELS: Record<string, string> = {
  analyze: "Analyze dataset",
  clean: "Clean & encode",
  train_instant: "Train model preview",
  forecast: "Forecast",
  business_insights: "Business insights",
  recommend: "Model ideas",
  export_pdf: "PDF report",
  export_bundle: "Export bundle",
  feature_suggest: "Generate features",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

function formatWhen(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatJobStatus(status: string) {
  const labels: Record<string, string> = {
    queued: "Waiting",
    running: "In progress",
    completed: "Done",
    failed: "Failed",
    canceled: "Canceled",
  };
  return labels[status] || status.replace(/_/g, " ");
}

function memberDisplayName(member: Member) {
  return member.full_name || member.email || member.invited_email || member.username || "Team member";
}

function memberInitials(member: Member) {
  const label = memberDisplayName(member);
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

function roleBadgeClass(role: string) {
  if (role === "owner") return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20";
  if (role === "admin") return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20";
  return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/15";
}

function looksLikeDefaultCompanyName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "My Workspace") return true;
  return trimmed.includes("@");
}

export default function CompanyWorkspacePage() {
  const searchParams = useSearchParams();

  const [companyAccount, setCompanyAccount] = useState<CompanyAccount | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [canCancelJobs, setCanCancelJobs] = useState(false);
  const [updatingRoleFor, setUpdatingRoleFor] = useState<string | null>(null);

  const isAdmin = Boolean(companyAccount?.can_manage_members);
  const isOwner = Boolean(companyAccount?.is_owner);
  const creditsBalance = companyAccount?.credits_balance ?? 0;
  const creditsQuota = companyAccount?.credits_monthly_quota ?? 0;
  const creditPct = creditsQuota > 0 ? Math.min(100, Math.round((creditsBalance / creditsQuota) * 100)) : 0;
  const needsSetup = isAdmin && looksLikeDefaultCompanyName(companyName);

  async function loadJobs(organizationId: string) {
    setJobsLoading(true);
    try {
      const data = await apiRequest<{ jobs: ProcessingJob[]; can_cancel_jobs?: boolean }>(
        `/workspaces/${organizationId}/jobs`
      );
      setJobs(data.jobs ?? []);
      setCanCancelJobs(Boolean(data.can_cancel_jobs));
    } catch (err) {
      toast.error(getUserFacingError(err, "Couldn't load recent activity."));
    } finally {
      setJobsLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest<{
        active_organization_id: string;
        company_account: CompanyAccount;
      }>("/workspaces");

      const account = data.company_account ?? { enabled: false };
      setCompanyAccount(account);
      setActiveId(data.active_organization_id);
      setCompanyName(account.organization_name ?? "");

      if (!account.enabled || !data.active_organization_id) {
        setMembers([]);
        setInvitations([]);
        setJobs([]);
        return;
      }

      const memberData = await apiRequest<{
        members: Member[];
        invitations: Invitation[];
        owner_user_id?: string;
      }>(`/workspaces/${data.active_organization_id}/members`);

      setMembers(memberData.members ?? []);
      setInvitations(memberData.invitations ?? []);
      setOwnerUserId(memberData.owner_user_id ?? account.owner_user_id ?? null);

      await loadJobs(data.active_organization_id);
    } catch (err) {
      toast.error(getUserFacingError(err, "Couldn't load your company workspace."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;
    toast.success("Welcome to your company workspace — set your team name to get started.");
    window.dispatchEvent(new Event("acutize:credits-updated"));
    const retryDelays = [0, 2000, 5000, 10000];
    const timers = retryDelays.map((delay) => window.setTimeout(() => void load(), delay));
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState({}, "", url.pathname + url.search);
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [searchParams]);

  async function saveCompanyName() {
    if (!activeId) return;
    const name = companyName.trim();
    if (name.length < 2) {
      toast.error("Company name must be at least 2 characters.");
      return;
    }
    setSavingName(true);
    try {
      await apiRequest(`/workspaces/${activeId}`, { method: "PUT", body: { name } });
      toast.success("Company name updated");
      setEditingName(false);
      await load();
    } catch (err) {
      toast.error(getUserFacingError(err, "Couldn't update the company name."));
    } finally {
      setSavingName(false);
    }
  }

  async function inviteMember() {
    const email = inviteEmail.trim();
    if (!email || !activeId) return;
    setInviting(true);
    try {
      const res = await apiRequest<{ email_sent?: boolean }>(`/workspaces/${activeId}/members`, {
        method: "POST",
        body: { email, role: inviteRole },
      });
      toast.success(
        res.email_sent
          ? "Invitation sent — they'll join when they sign up with that email."
          : "Invitation saved — ask them to sign up with that email address."
      );
      setInviteEmail("");
      await load();
    } catch (err) {
      toast.error(getUserFacingError(err, "Couldn't send the invite."));
    } finally {
      setInviting(false);
    }
  }

  async function revokeInvite(invitationId: string) {
    if (!activeId) return;
    try {
      await apiRequest(`/workspaces/${activeId}/invitations/${invitationId}`, { method: "DELETE" });
      toast.success("Invite canceled");
      await load();
    } catch (err) {
      toast.error(getUserFacingError(err, "Couldn't cancel the invite."));
    }
  }

  async function removeMember(userId: string) {
    if (!activeId) return;
    try {
      await apiRequest(`/workspaces/${activeId}/members/${userId}`, { method: "DELETE" });
      toast.success("Team member removed");
      await load();
    } catch (err) {
      toast.error(getUserFacingError(err, "Couldn't remove this member."));
    }
  }

  async function updateMemberRole(userId: string, role: "admin" | "member") {
    if (!activeId) return;
    setUpdatingRoleFor(userId);
    try {
      await apiRequest(`/workspaces/${activeId}/members/${userId}`, {
        method: "PATCH",
        body: { role },
      });
      toast.success(role === "admin" ? "Promoted to admin" : "Changed to member");
      await load();
    } catch (err) {
      toast.error(getUserFacingError(err, "Couldn't update this role."));
    } finally {
      setUpdatingRoleFor(null);
    }
  }

  async function cancelJob(jobId: string) {
    try {
      await apiRequest(`/jobs/${jobId}/cancel`, { method: "POST" });
      toast.success("Task canceled");
      if (activeId) await loadJobs(activeId);
      window.dispatchEvent(new CustomEvent("acutize:credits-updated"));
    } catch (err) {
      toast.error(getUserFacingError(err, "Couldn't cancel this task."));
    }
  }

  if (!loading && !companyAccount?.enabled) {
    return (
      <div className="mx-auto max-w-3xl animate-in fade-in duration-500">
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] backdrop-blur p-8 md:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 mb-5">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Company workspace</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-xl">
            Shared company workspaces are included with custom pricing. Give your team one credit pool,
            one dataset library, and role-based access — while billing stays with the account owner.
          </p>
          <Button asChild className="mt-6">
            <Link href="/dashboard/contact?topic=custom-credits">Contact us about custom pricing</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header — company name top-left with inline edit */}
      <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              {editingName && isAdmin ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    autoFocus
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveCompanyName();
                      if (e.key === "Escape") {
                        setEditingName(false);
                        setCompanyName(companyAccount?.organization_name ?? "");
                      }
                    }}
                    className="h-10 max-w-md text-lg font-semibold"
                    placeholder="Your company name"
                  />
                  <Button size="icon" variant="outline" onClick={() => void saveCompanyName()} disabled={savingName}>
                    {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditingName(false);
                      setCompanyName(companyAccount?.organization_name ?? "");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="truncate text-2xl md:text-3xl font-bold tracking-tight">
                    {companyName || "Company workspace"}
                  </h1>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => setEditingName(true)}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                      aria-label="Edit company name"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                {companyAccount?.is_owner
                  ? "You own this workspace — billing stays with you; promote admins to help manage the team."
                  : companyAccount?.role === "admin"
                    ? "You're an admin — you can invite teammates and manage activity."
                    : `You're a member — view team activity and use shared credits.`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            Custom plan
          </span>
          {companyAccount?.role ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                roleBadgeClass(companyAccount.role)
              )}
            >
              {companyAccount.role === "owner" ? <Shield className="h-3 w-3" /> : null}
              {ROLE_LABELS[companyAccount.role] ?? companyAccount.role}
            </span>
          ) : null}
        </div>
      </header>

      {needsSetup ? (
        <div className="rounded-xl border border-blue-500/25 bg-gradient-to-r from-blue-500/10 to-indigo-500/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-semibold text-sm">Finish setting up your company portal</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add your company name — it appears for every teammate you invite.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditingName(true)}>
            Set company name
          </Button>
        </div>
      ) : null}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] backdrop-blur">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-blue-500" />
              Shared credits
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {creditsBalance.toLocaleString()}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {creditsQuota.toLocaleString()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all"
                style={{ width: `${creditPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">One pool for the whole company — refreshed monthly.</p>
          </CardContent>
        </Card>

        <Card className="border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] backdrop-blur">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Team size
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">{companyAccount?.member_count ?? members.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {(companyAccount?.pending_invitations ?? 0) > 0
                ? `${companyAccount?.pending_invitations} pending invite(s)`
                : "Invite colleagues by email — they join automatically when they sign up."}
            </p>
          </CardContent>
        </Card>

        <Card className="border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] backdrop-blur sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardDescription>How collaboration works</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2">
            <p>
              The <strong className="text-foreground">owner</strong> handles billing and can promote members to admin.
              Admins help manage the team; everyone can view shared activity.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Team */}
        <Card className="lg:col-span-3 border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-blue-500" />
              Team
            </CardTitle>
            <CardDescription>Everyone on this company workspace shares datasets and credits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isAdmin ? (
              <div className="rounded-xl border border-dashed border-black/15 dark:border-white/15 p-4 space-y-3 bg-black/[0.02] dark:bg-white/[0.02]">
                <p className="text-sm font-medium flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-blue-500" />
                  Invite a teammate
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    type="email"
                    className="flex-1"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button onClick={() => void inviteMember()} disabled={inviting || !inviteEmail.trim()}>
                    {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invite"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  They&apos;ll receive an email link. When they create an account with this address, they&apos;re added
                  to your portal automatically.
                </p>
              </div>
            ) : null}

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading team…
              </div>
            ) : (
              <div className="space-y-2">
                {invitations.map((invite) => (
                  <div
                    key={invite.invitation_id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-black/10 dark:border-white/10 px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{invite.email}</p>
                        <p className="text-xs text-muted-foreground">Invite pending · expires {formatWhen(invite.expires_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", roleBadgeClass(invite.role))}>
                        {invite.role}
                      </span>
                      {isAdmin ? (
                        <Button variant="ghost" size="icon" onClick={() => void revokeInvite(invite.invitation_id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {members.map((member) => {
                  const isMemberOwner = ownerUserId === member.user_id || member.role === "owner";
                  const canRemove =
                    isAdmin &&
                    !isMemberOwner &&
                    (isOwner || member.role === "member");
                  return (
                    <div
                      key={member.user_id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-black/10 dark:border-white/10 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white text-xs font-semibold">
                          {memberInitials(member)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{memberDisplayName(member)}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.email || member.invited_email || "Active member"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isOwner && !isMemberOwner ? (
                          <select
                            value={member.role === "admin" ? "admin" : "member"}
                            disabled={updatingRoleFor === member.user_id}
                            onChange={(e) =>
                              void updateMemberRole(member.user_id, e.target.value as "admin" | "member")
                            }
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase",
                              roleBadgeClass(member.role)
                            )}
                          >
                            {isMemberOwner ? "Owner" : ROLE_LABELS[member.role] ?? member.role}
                          </span>
                        )}
                        {canRemove ? (
                          <Button variant="ghost" size="icon" onClick={() => void removeMember(member.user_id)}>
                            <UserMinus className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity — visible to all members; cancel reserved for admins */}
        <Card className="lg:col-span-2 border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] backdrop-blur">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Recent activity</CardTitle>
              <CardDescription className="mt-1">
                {isAdmin
                  ? "Background jobs across your team."
                  : "Read-only view of team background jobs."}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              disabled={jobsLoading}
              onClick={() => activeId && void loadJobs(activeId)}
            >
              <RefreshCw className={cn("h-4 w-4", jobsLoading && "animate-spin")} />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[420px] overflow-y-auto">
            {jobsLoading && jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </p>
            ) : null}
            {!jobsLoading && jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No recent team activity yet.</p>
            ) : null}
            {jobs.map((job) => (
              <div key={job.job_id} className="rounded-lg border border-black/10 dark:border-white/10 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{ACTION_LABELS[job.action] || job.action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatJobStatus(job.status)} · {formatWhen(job.queued_at)}
                    </p>
                    {job.error ? (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {getUserFacingJobError(job.error) || "Task failed"}
                      </p>
                    ) : null}
                  </div>
                  {canCancelJobs && job.status === "queued" ? (
                    <Button variant="outline" size="sm" onClick={() => void cancelJob(job.job_id)}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
