import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentAgency } from "@/lib/auth";

export default async function TicketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const agency = await getCurrentAgency();

  return (
    <AppShell
      variant="app"
      user={{
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      }}
      agency={
        agency
          ? {
              id: agency.id,
              name: agency.name,
              slug: agency.slug,
              primaryColor: agency.primaryColor,
              secondaryColor: agency.secondaryColor,
              logoPath: agency.logoPath,
            }
          : null
      }
      cdnHost={process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME}
    >
      {children}
    </AppShell>
  );
}
