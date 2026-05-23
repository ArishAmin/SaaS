import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatasetsTable } from "@/components/datasets/DatasetsTable";
import { DatasetUploadCard } from "@/components/datasets/DatasetUploadCard";
import { FillProfileForm } from "@/components/auth/FillProfileForm";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if the user has a full name in their metadata
  let fullName = user.user_metadata?.full_name;

  // Smart fallback: If Google provides a 'name' but we haven't mapped it to 'full_name' yet,
  // we use it automatically so the user doesn't have to write it again.
  if (!fullName && user.user_metadata?.name) {
    fullName = user.user_metadata.name;
    
    // Optional: Silently update the metadata for future sessions
    // Note: This is an async fire-and-forget or we can just rely on the fallback
    await supabase.auth.updateUser({
      data: { full_name: fullName }
    });
  }

  if (!fullName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <FillProfileForm />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl space-y-1">
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
            Welcome, {fullName.split(" ")[0]}!
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your unified workspace for dataset preparation, analysis, and ML training.
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        <DatasetUploadCard />
        <DatasetsTable />
      </div>

    </div>
  );
}
