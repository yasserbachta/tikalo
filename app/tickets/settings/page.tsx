import { getCurrentAgency } from "@/lib/auth";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { SettingsForm } from "./SettingsForm";

const CDN_HOST = process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME;

export default async function AgencySettingsPage() {
  const agency = await getCurrentAgency();

  if (!agency) {
    return (
      <PageContainer>
        <PageHeader
          eyebrow="Settings"
          title="Agency settings"
          description="Branding and contact details printed on your exported tickets."
        />
        <p className="mt-10 text-muted-foreground">
          No agency is assigned to your account.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title={
          <>
            Branding &amp; <span className="text-brand">contact</span>
          </>
        }
        description="These colors and contact details appear on every ticket PDF you export."
      />
      <SettingsForm
        cdnHost={CDN_HOST}
        agency={{
          name: agency.name,
          slogan: agency.slogan,
          logoPath: agency.logoPath,
          primaryColor: agency.primaryColor,
          secondaryColor: agency.secondaryColor,
          pdfTemplate: agency.pdfTemplate,
          pdfPaletteKey: agency.pdfPaletteKey,
          contactPhone: agency.contactPhone,
          contactEmail: agency.contactEmail,
          contactWebsite: agency.contactWebsite,
          addressLine1: agency.addressLine1,
          addressLine2: agency.addressLine2,
        }}
      />
    </PageContainer>
  );
}
