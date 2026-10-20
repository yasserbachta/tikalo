"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PdfTemplate } from "@prisma/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateMyAgency } from "@/actions/agencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PdfTemplatePicker } from "@/components/tickets/PdfTemplatePicker";
import { LogoUpload } from "@/components/layout/LogoUpload";

interface AgencySettings {
  name: string;
  slogan: string | null;
  logoPath: string | null;
  primaryColor: string;
  secondaryColor: string;
  pdfTemplate: PdfTemplate;
  pdfPaletteKey: string;
  contactPhone: string | null;
  contactEmail: string | null;
  contactWebsite: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
}

export function SettingsForm({
  agency,
  cdnHost,
}: {
  agency: AgencySettings;
  cdnHost?: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(agency.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(agency.secondaryColor);
  const [template, setTemplate] = useState<PdfTemplate>(agency.pdfTemplate);
  const [paletteKey, setPaletteKey] = useState(agency.pdfPaletteKey);
  const [logoPath, setLogoPath] = useState<string | null>(agency.logoPath);

  const initials = agency.name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    const form = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v.trim() : "";
    };

    try {
      const result = await updateMyAgency({
        slogan: get("slogan") || null,
        logoPath,
        primaryColor,
        secondaryColor,
        pdfTemplate: template,
        pdfPaletteKey: paletteKey,
        contactPhone: get("contactPhone") || null,
        contactEmail: get("contactEmail") || null,
        contactWebsite: get("contactWebsite") || null,
        addressLine1: get("addressLine1") || null,
        addressLine2: get("addressLine2") || null,
      });
      if (!result.ok) throw new Error(result.error);
      toast.success("Settings saved");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save settings";
      toast.error(message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-10 space-y-6">
      {/* Identity — name read-only; logo & slogan editable */}
      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{agency.name}</p>
            <p className="text-[12px] text-muted-foreground">
              Your agency name is managed by your administrator.
            </p>
          </div>
          <LogoUpload
            value={logoPath}
            onChange={setLogoPath}
            cdnHost={cdnHost}
            fallbackColor={primaryColor}
            initials={initials}
            uploadEndpoint="/api/tickets/settings/upload-logo"
          />
          <div className="space-y-2">
            <Label htmlFor="slogan">Slogan</Label>
            <Input
              id="slogan"
              name="slogan"
              defaultValue={agency.slogan ?? ""}
              placeholder="e.g. rester a jour"
            />
            <p className="text-[12px] text-muted-foreground">
              Shown under your agency name in the PDF header. Leave blank to hide
              it.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* PDF document — template + colors, with live preview */}
      <Card>
        <CardHeader>
          <CardTitle>Modèle de billet PDF</CardTitle>
        </CardHeader>
        <CardContent>
          <PdfTemplatePicker
            template={template}
            paletteKey={paletteKey}
            onTemplateChange={setTemplate}
            onPaletteChange={setPaletteKey}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            onPrimaryColorChange={setPrimaryColor}
            onSecondaryColorChange={setSecondaryColor}
            previewEndpoint="/api/tickets/settings/preview-pdf"
          />
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader>
          <CardTitle>Contact details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Phone</Label>
              <Input
                id="contactPhone"
                name="contactPhone"
                defaultValue={agency.contactPhone ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact email</Label>
              <Input
                id="contactEmail"
                name="contactEmail"
                type="email"
                defaultValue={agency.contactEmail ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactWebsite">Website</Label>
            <Input
              id="contactWebsite"
              name="contactWebsite"
              defaultValue={agency.contactWebsite ?? ""}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="addressLine1">Address line 1</Label>
              <Input
                id="addressLine1"
                name="addressLine1"
                defaultValue={agency.addressLine1 ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressLine2">Address line 2</Label>
              <Input
                id="addressLine2"
                name="addressLine2"
                defaultValue={agency.addressLine2 ?? ""}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
