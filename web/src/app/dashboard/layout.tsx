import { DashboardShell } from "@/components/layout/DashboardShell";
import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    redirect("/login");
  }

  return <DashboardShell>{children}</DashboardShell>;
}

