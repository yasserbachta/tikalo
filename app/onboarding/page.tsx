import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getCurrentAgency } from "@/lib/auth";
import { OnboardingLogoForm } from "./OnboardingLogoForm";

const CDN_HOST = process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME;

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const agency = await getCurrentAgency();
  if (!agency) redirect("/tickets");

  return (
    <OnboardingLogoForm
      cdnHost={CDN_HOST}
      agency={{ name: agency.name, logoPath: agency.logoPath }}
    />
  );
}
