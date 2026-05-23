import { redirect } from "next/navigation";

import { LandingPage } from "@/components/marketing/LandingPage";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getSession();

  if (data.session) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
