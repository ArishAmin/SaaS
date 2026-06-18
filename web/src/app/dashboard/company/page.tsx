"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiRequest, getUserFacingError, getUserFacingJobError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CompanyAccount = {
  enabled?: boolean;
  organization_id?: string;
  organization_name?: string;
  member_count?: number;
  pending_invitations?: number;
  plan?: string;
  role?: string;
  can_manage_members?: boolean;
};

type Workspace = {
  organization_id: string;
  name: string;
  role: "owner" | "admin" | "member";
  plan: string;
  subscription_status: string;
  credits_balance?: number;
  credits_monthly_quota?: number;
};

type Member = {
  user_id: string;
  role: string;
  status: string;
  invited_email?: string | null;
  created_at?: string;
};

type Invitation = {
  invitation_id: string;
  email: string;
  role: string;
  status: string;
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
  eda: "EDA report",
  quality: "Data quality",
  feature_suggest: "Generate features",
  feature_engineer: "Feature engineering",
};

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

function formatWhen(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function CompanyWorkspacePage() {
  const [companyAccount, setCompanyAccount] = useState<CompanyAccount | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [savingName, setSavingName] = useState(false);

  async function loadJobs(organizationId: string, canManage = false) {
    if (!canManage) return;
    setJobsLoading(true);
    try {
      const data = await apiRequest<{ jobs: ProcessingJob[] }>(`/workspaces/${organizationId}/jobs`);
      setJobs(data.jobs ?? []);
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
        workspaces: Workspace[];
        company_account: CompanyAccount;
      }>("/workspaces");

      setCompanyAccount(data.company_account ?? { enabled: false });
      setActiveId(data.active_organization_id);
      setWorkspaces(data.workspaces ?? []);
      setCompanyName(data.company_account?.organization_name ?? "");

      if (!data.company_account?.enabled) {
        setMembers([]);
        setInvitations([]);
        setJobs([]);
        return;
      }

      if (data.active_organization_id) {
        const memberData = await apiRequest<{ members: Member[]; invitations: Invitation[] }>(
          `/workspaces/${data.active_organization_id}/members`
        );
        setMembers(memberData.members ?? []);
        setInvitations(memberData.invitations ?? []);
        if (data.company_account?.can_manage_members) {
          await loadJobs(data.active_organization_id, true);
        }
      }
    } catch (err) {
      toast.error(getUserFacingError(err, "Couldn't load your company workspace."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
      toast.success("Company workspace name updated");
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
    try {
      await apiRequest(`/workspaces/${activeId}/members`, {
        method: "POST",
        body: { email, role: "member" },
      });
      toast.success("Invite recorded for your company workspace");
      setInviteEmail("");
      await load();
    } catch (err) {
      toast.error(getUserFacingError(err, "Couldn't send the invite."));
    }
  }

  async function cancelJob(jobId: string) {
    try {
      await apiRequest(`/jobs/${jobId}/cancel`, { method: "POST" });
      toast.success("Task canceled");
      if (activeId) await loadJobs(activeId, true);
      window.dispatchEvent(new CustomEvent("acutize:credits-updated"));
    } catch (err) {
      toast.error(getUserFacingError(err, "Couldn't cancel this task."));
    }
  }

  const isAdmin = Boolean(companyAccount?.can_manage_members);

  if (!loading && !companyAccount?.enabled) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Company workspace</h1>
          <p className="mt-2 text-sm text-foreground/70">
            A shared company workspace is included with custom pricing only. Free, Pro, and Business plans
            are individual accounts. We set up company workspaces when you choose a custom credit package.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-foreground/70">
              Need several employees on one credit pool and dataset library? Contact us about custom pricing
              and we&apos;ll provision your company workspace.
            </p>
            <Button asChild>
              <Link href="/dashboard/contact?topic=custom-credits">Contact us about custom pricing</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Company workspace</h1>
        <p className="text-sm text-foreground/65">
          Your organization&apos;s shared credit pool, datasets, and teammates on a custom plan.
        </p>
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Company name</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground/65">
              This name is shown to everyone on your company workspace (for example, &quot;Acme Analytics&quot;).
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="company-name" className="sr-only">
                  Company name
                </Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Your company name"
                />
              </div>
              <Button onClick={() => void saveCompanyName()} disabled={savingName || !activeId}>
                {savingName ? "Saving..." : "Save name"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-lg font-semibold">{companyAccount?.organization_name || "Company workspace"}</p>
            <p className="text-sm text-foreground/60 mt-1">You&apos;re a member of this company workspace.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="text-sm text-foreground/60">Loading...</p> : null}

          {isAdmin ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="colleague@company.com"
                type="email"
              />
              <Button onClick={() => void inviteMember()} disabled={!activeId}>
                Invite teammate
              </Button>
            </div>
          ) : (
            <p className="text-sm text-foreground/60">
              Your company admin can invite additional teammates.
            </p>
          )}

          <div className="space-y-2">
            {invitations.map((invite) => (
              <div
                key={invite.invitation_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-foreground/60">Invite pending</p>
                </div>
                <span className="rounded bg-muted px-2 py-1 text-xs font-medium uppercase">{invite.role}</span>
              </div>
            ))}
            {members.map((member) => (
              <div
                key={`${member.user_id}-${member.invited_email ?? ""}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{member.invited_email || "Team member"}</p>
                  <p className="text-xs text-foreground/60">{member.status}</p>
                </div>
                <span className="rounded bg-muted px-2 py-1 text-xs font-medium uppercase">{member.role}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Recent activity</CardTitle>
            <Button
              variant="outline"
              size="sm"
              disabled={!activeId || jobsLoading}
              onClick={() => activeId && void loadJobs(activeId, true)}
            >
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-foreground/65">
              Long-running tasks started by anyone on your company workspace.
            </p>
            {jobsLoading ? <p className="text-sm text-foreground/60">Loading...</p> : null}
            {!jobsLoading && jobs.length === 0 ? (
              <p className="text-sm text-foreground/60">No recent activity.</p>
            ) : null}
            {jobs.map((job) => (
              <div
                key={job.job_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {ACTION_LABELS[job.action] || job.action}
                    <span className="ml-2 text-xs font-normal text-foreground/60">
                      {formatJobStatus(job.status)}
                    </span>
                  </p>
                  <p className="text-xs text-foreground/60">
                    Started {formatWhen(job.queued_at)}
                    {job.error ? ` · ${getUserFacingJobError(job.error) || "Task failed"}` : ""}
                  </p>
                </div>
                {job.status === "queued" ? (
                  <Button variant="outline" size="sm" onClick={() => void cancelJob(job.job_id)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
