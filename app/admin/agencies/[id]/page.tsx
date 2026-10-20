"use client";

import { use, useState } from "react";
import { PdfTemplate } from "@prisma/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query/keys";
import { fetchJson } from "@/lib/query/fetcher";
import { updateAgency as updateAgencyAction } from "@/actions/agencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { LogoUpload } from "@/components/layout/LogoUpload";
import { PdfTemplatePicker } from "@/components/tickets/PdfTemplatePicker";
import { AmountInput } from "@/components/admin/AmountInput";

const CDN_HOST = process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME;

interface AgencyDetail {
  id: string;
  name: string;
  email: string;
  slug: string;
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
  status: "ACTIVE" | "SUSPENDED";
  plan: "TRIAL" | "PREMIUM";
  trialUploadsUsed: number;
  expiryDate: string | null;
  amountPaid: number | null;
  maritimeEditorEnabled: boolean;
  _count: { tickets: number };
}

export default function AgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoTouched, setLogoTouched] = useState(false);
  const [statusValue, setStatusValue] = useState<"ACTIVE" | "SUSPENDED" | null>(
    null
  );
  const [planValue, setPlanValue] = useState<"TRIAL" | "PREMIUM" | null>(null);
  const [templateValue, setTemplateValue] = useState<PdfTemplate | null>(null);
  const [paletteValue, setPaletteValue] = useState<string | null>(null);
  const [primaryColorValue, setPrimaryColorValue] = useState<string | null>(
    null
  );
  const [secondaryColorValue, setSecondaryColorValue] = useState<string | null>(
    null
  );
  // null = "not yet touched this session" → fall through to the saved value.
  const [amountPaidValue, setAmountPaidValue] = useState<number | null>(null);
  const [amountTouched, setAmountTouched] = useState(false);
  const [maritimeEditorValue, setMaritimeEditorValue] = useState<
    boolean | null
  >(null);

  const { data: agency, isLoading } = useQuery<AgencyDetail>({
    queryKey: queryKeys.agency(id),
    queryFn: () => fetchJson<AgencyDetail>(`/api/admin/agencies/${id}`),
  });

  // Saved value falls through until the admin makes a change this session.
  const template = templateValue ?? agency?.pdfTemplate ?? "CLASSIC";
  const paletteKey = paletteValue ?? agency?.pdfPaletteKey ?? "default";
  const primaryColor = primaryColorValue ?? agency?.primaryColor ?? "#1a2d5a";
  const secondaryColor =
    secondaryColorValue ?? agency?.secondaryColor ?? "#f0f2f5";

  const { mutate: updateAgency, isPending: isUpdating } = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const result = await updateAgencyAction(id, data);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agency(id) });
      toast.success("Agency updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v.trim() : "";
    };
    updateAgency({
      name: get("name"),
      email: get("email"),
      slug: get("slug"),
      ...(logoTouched ? { logoPath } : {}),
      primaryColor,
      secondaryColor,
      pdfTemplate: template,
      pdfPaletteKey: paletteKey,
      contactPhone: get("contactPhone") || null,
      contactEmail: get("contactEmail") || null,
      contactWebsite: get("contactWebsite") || null,
      addressLine1: get("addressLine1") || null,
      addressLine2: get("addressLine2") || null,
      status: statusValue ?? agency?.status,
      plan: planValue ?? agency?.plan,
      expiryDate: get("expiryDate") || null,
      amountPaid: amountTouched ? amountPaidValue : agency?.amountPaid ?? null,
      maritimeEditorEnabled:
        maritimeEditorValue ?? agency?.maritimeEditorEnabled ?? false,
    });
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <Skeleton className="h-8 w-[200px]" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </PageContainer>
    );
  }

  if (!agency) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Agency not found.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Agency"
        breadcrumbs={[
          { label: "Agencies", href: "/admin/agencies" },
          { label: agency.name },
        ]}
        title={
          <span className="flex items-center gap-4 flex-wrap">
            <span
              className="size-10 rounded-xl ring-1 ring-inset ring-foreground/10"
              style={{ background: agency.primaryColor }}
              aria-hidden
            />
            {agency.name}
            <Badge
              variant={agency.status === "ACTIVE" ? "default" : "destructive"}
              className="ml-1"
            >
              {agency.status}
            </Badge>
          </span>
        }
        description={
          <span className="font-mono text-[12px] tracking-wider uppercase">
            /{agency.slug} · {agency._count.tickets} tickets on record
          </span>
        }
      />
      <div className="mt-8">

      <div className="grid grid-cols-1 gap-6">
        {/* Edit Form */}
        <Card>
          <CardHeader>
            <CardTitle>Agency Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="pb-2">
                <LogoUpload
                  value={logoTouched ? logoPath : agency.logoPath}
                  onChange={(v) => {
                    setLogoPath(v);
                    setLogoTouched(true);
                  }}
                  cdnHost={CDN_HOST}
                  fallbackColor={agency.primaryColor}
                  initials={agency.name
                    .split(/\s+/)
                    .map((s) => s[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={agency.name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input id="slug" name="slug" defaultValue={agency.slug} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={agency.email}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={statusValue ?? agency.status}
                  onValueChange={(v) =>
                    setStatusValue(v as "ACTIVE" | "SUSPENDED")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan">Plan</Label>
                <Select
                  value={planValue ?? agency.plan}
                  onValueChange={(v) => setPlanValue(v as "TRIAL" | "PREMIUM")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRIAL">Trial — 10 uploads</SelectItem>
                    <SelectItem value="PREMIUM">Premium — unlimited</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[12px] text-muted-foreground">
                  {(planValue ?? agency.plan) === "TRIAL"
                    ? `${agency.trialUploadsUsed} / 10 trial uploads used. Switch to Premium to lift the cap.`
                    : "Unlimited uploads."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Upload expiry date</Label>
                  <Input
                    id="expiryDate"
                    name="expiryDate"
                    type="date"
                    defaultValue={agency.expiryDate?.slice(0, 10) ?? ""}
                  />
                  <p className="text-[12px] text-muted-foreground">
                    From this date the agency can no longer upload tickets. Leave
                    blank for no expiry.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amountPaid">Amount paid</Label>
                  <AmountInput
                    id="amountPaid"
                    placeholder="0"
                    value={amountTouched ? amountPaidValue : agency.amountPaid}
                    onChange={(v) => {
                      setAmountPaidValue(v);
                      setAmountTouched(true);
                    }}
                  />
                </div>
              </div>
              {/* Feature flag: maritime PDF editor */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
                <div>
                  <Label htmlFor="maritimeEditorEnabled">
                    Éditeur PDF maritime
                  </Label>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Les billets maritimes sont modifiés directement sur le PDF
                    de la compagnie au lieu du remplacement automatique du prix.
                    Désactiver pour revenir à l&apos;ancien mode.
                  </p>
                </div>
                <Switch
                  id="maritimeEditorEnabled"
                  checked={
                    maritimeEditorValue ?? agency.maritimeEditorEnabled
                  }
                  onCheckedChange={(v) => setMaritimeEditorValue(v)}
                />
              </div>

              {/* PDF template + palette selection */}
              <div className="space-y-4 rounded-xl border border-border p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Modèle de billet PDF
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    Choisissez la mise en page et la palette des billets exportés
                    par cette agence.
                  </p>
                </div>
                <PdfTemplatePicker
                  template={template}
                  paletteKey={paletteKey}
                  onTemplateChange={setTemplateValue}
                  onPaletteChange={setPaletteValue}
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                  onPrimaryColorChange={setPrimaryColorValue}
                  onSecondaryColorChange={setSecondaryColorValue}
                  previewEndpoint={`/api/admin/agencies/${id}/preview-pdf`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Phone</Label>
                  <Input
                    id="contactPhone"
                    name="contactPhone"
                    defaultValue={agency.contactPhone ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email</Label>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="addressLine1">Address Line 1</Label>
                  <Input
                    id="addressLine1"
                    name="addressLine1"
                    defaultValue={agency.addressLine1 ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressLine2">Address Line 2</Label>
                  <Input
                    id="addressLine2"
                    name="addressLine2"
                    defaultValue={agency.addressLine2 ?? ""}
                  />
                </div>
              </div>
              <Button type="submit" disabled={isUpdating}>
                {isUpdating ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

      </div>

      </div>
    </PageContainer>
  );
}
