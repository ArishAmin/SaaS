import { redirect } from "next/navigation";

export default function LegacyTeamSettingsRedirect() {
  redirect("/dashboard/company");
}
