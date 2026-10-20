"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Building2, MailCheck, KeyRound, Palette, Wallet } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { LogoUpload } from "@/components/layout/LogoUpload";
import { cn } from "@/lib/utils";
import { createAgency } from "@/actions/agencies";

const CDN_HOST = process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME;

// URL-safe slug: lowercase, spaces/punctuation → hyphens, trim stray hyphens.
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function NewAgencyPage() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [primaryColor, setPrimaryColor] = useState("#1a2d5a");
  const [secondaryColor, setSecondaryColor] = useState("#f0f2f5");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Track whether the user has hand-edited the slug, so we stop auto-filling.
  const [slugEdited, setSlugEdited] = useState(false);
  const [amountPaid, setAmountPaid] = useState<number | null>(null);
  const [plan, setPlan] = useState<"TRIAL" | "PREMIUM">("TRIAL");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);

    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get("name"),
      email: form.get("email"),
      slug: form.get("slug"),
      logoPath,
      primaryColor,
      secondaryColor,
      contactPhone: form.get("contactPhone") || undefined,
      contactEmail: form.get("contactEmail") || undefined,
      contactWebsite: form.get("contactWebsite") || undefined,
      addressLine1: form.get("addressLine1") || undefined,
      addressLine2: form.get("addressLine2") || undefined,
      expiryDate: form.get("expiryDate") || undefined,
      amountPaid,
      plan,
      adminName: form.get("adminName"),
      adminEmail: form.get("adminEmail"),
      adminPassword: form.get("adminPassword"),
    };

    try {
      const result = await createAgency(body);
      if (!result.ok) throw new Error(result.error);

      toast.success("Agency provisioned");
      router.push("/admin/agencies");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create agency";
      toast.error(message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        eyebrow="Provision"
        breadcrumbs={[
          { label: "Agencies", href: "/admin/agencies" },
          { label: "New" },
        ]}
        title={
          <>
            Add a new <span className="text-brand">agency</span>.
          </>
        }
        description="Create an isolated workspace with its own team, branding, and tickets."
      />

      <form onSubmit={onSubmit} className="mt-10 space-y-6">
        <FormSection
          step="01"
          icon={Building2}
          title="Agency identity"
          description="The name and slug your agency will travel under."
        >
          <div className="mb-6">
            <LogoUpload
              value={logoPath}
              onChange={setLogoPath}
              cdnHost={CDN_HOST}
              fallbackColor={primaryColor}
              initials={
                name
                  .split(/\s+/)
                  .map((s) => s[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase() || "AG"
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Field label="Agency name" required>
              <input
                name="name"
                required
                placeholder="Mediterranean Voyages"
                className="atelier-input"
                value={name}
                onChange={(e) => {
                  const next = e.target.value;
                  setName(next);
                  if (!slugEdited) setSlug(slugify(next));
                }}
              />
            </Field>
            <Field label="Slug" required hint="auto-filled from name — editable">
              <input
                name="slug"
                pattern="[a-z0-9-]+"
                placeholder="med-voyages"
                required
                className="atelier-input font-mono"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(slugify(e.target.value));
                }}
              />
            </Field>
            <Field label="Agency email" required className="lg:col-span-2">
              <input
                name="email"
                type="email"
                required
                placeholder="contact@agency.travel"
                className="atelier-input"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          step="02"
          icon={Palette}
          title="Brand palette"
          description="These colors will tint exported PDF tickets and the agency dashboard."
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ColorField
              label="Primary"
              value={primaryColor}
              onChange={setPrimaryColor}
              hint="Used for headers and accents"
            />
            <ColorField
              label="Secondary"
              value={secondaryColor}
              onChange={setSecondaryColor}
              hint="Used for surfaces"
            />
          </div>
          {/* Preview chip */}
          <div className="mt-5 paper p-4 flex items-center gap-3">
            <span
              className="size-10 rounded-xl ring-1 ring-inset ring-foreground/10"
              style={{ background: primaryColor }}
            />
            <span
              className="size-10 rounded-xl ring-1 ring-inset ring-foreground/10"
              style={{ background: secondaryColor }}
            />
            <div className="flex-1">
              <p className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground">
                Preview
              </p>
              <p className="text-sm font-medium">How your brand will appear</p>
            </div>
          </div>
        </FormSection>

        <FormSection
          step="03"
          icon={MailCheck}
          title="Contact directory"
          description="Optional contact details printed on exported tickets."
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Field label="Phone">
              <input name="contactPhone" className="atelier-input" />
            </Field>
            <Field label="Contact email">
              <input
                name="contactEmail"
                type="email"
                className="atelier-input"
              />
            </Field>
            <Field label="Website" className="lg:col-span-2">
              <input name="contactWebsite" className="atelier-input" />
            </Field>
            <Field label="Address line 1">
              <input name="addressLine1" className="atelier-input" />
            </Field>
            <Field label="Address line 2">
              <input name="addressLine2" className="atelier-input" />
            </Field>
          </div>
        </FormSection>

        <FormSection
          step="04"
          icon={Wallet}
          title="Billing & access"
          description="Optional: when the agency's upload access ends, and what they've paid."
        >
          <Field label="Plan" hint="TRIAL caps uploads at 10">
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as "TRIAL" | "PREMIUM")}
              className="atelier-input cursor-pointer"
            >
              <option value="TRIAL">Trial — 10 uploads</option>
              <option value="PREMIUM">Premium — unlimited</option>
            </select>
          </Field>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <Field label="Upload expiry date" hint="blank = no expiry">
              <input name="expiryDate" type="date" className="atelier-input" />
            </Field>
            <Field label="Amount paid">
              <input
                name="amountPaidDisplay"
                inputMode="numeric"
                placeholder="0"
                className="atelier-input"
                value={amountPaid == null ? "" : amountPaid.toLocaleString("fr-FR")}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^\d]/g, "");
                  setAmountPaid(digits === "" ? null : parseInt(digits, 10));
                }}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          step="05"
          icon={KeyRound}
          title="First operator"
          description="The first user who will sign in. Additional team members can be invited later."
        >
          <div className="space-y-5">
            <Field label="Name" required>
              <input name="adminName" required className="atelier-input" />
            </Field>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Field label="Email" required>
                <input
                  name="adminEmail"
                  type="email"
                  required
                  className="atelier-input"
                />
              </Field>
              <Field label="Passphrase" required hint="min 6 characters">
                <input
                  name="adminPassword"
                  type="password"
                  minLength={6}
                  required
                  className="atelier-input"
                />
              </Field>
            </div>
          </div>
        </FormSection>

        <div className="sticky bottom-4 z-20 paper p-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.push("/admin/agencies")}
            className="h-9 px-3.5 rounded-xl border border-border bg-card hover:bg-muted/60 text-sm font-medium inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="group h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 shadow-sm hover:brightness-105 transition-all disabled:opacity-60 cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Creating…
              </>
            ) : (
              <>
                Create agency
                <ArrowRight className="size-4 nudge-right" />
              </>
            )}
          </button>
        </div>
      </form>
      <style jsx>{`
        :global(.atelier-input) {
          width: 100%;
          background: transparent;
          border: 0;
          padding: 10px 0;
          font-size: 15px;
          color: var(--color-foreground);
          outline: none;
        }
        :global(.atelier-input::placeholder) {
          color: oklch(0.6 0.025 252 / 0.5);
        }
      `}</style>
    </PageContainer>
  );
}

function FormSection({
  step,
  icon: Icon,
  title,
  description,
  children,
}: {
  step: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="paper p-6 lg:p-8 reveal">
      <div className="flex items-start gap-4 mb-6">
        <div className="size-10 rounded-xl bg-brand-soft/60 grid place-items-center shrink-0">
          <Icon className="size-5 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="eyebrow text-brand mb-1">Step {step}</p>
          <h2 className="display text-lg font-medium leading-tight">{title}</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("group block", className)}>
      <div className="flex items-baseline justify-between mb-1">
        <span className="eyebrow">
          {label}
          {required && <span className="text-brand ml-1">*</span>}
        </span>
        {hint && (
          <span className="text-[10px] text-muted-foreground/70 font-mono">
            {hint}
          </span>
        )}
      </div>
      <div className="border-b border-border group-focus-within:border-brand transition-colors">
        {children}
      </div>
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="eyebrow">{label}</span>
        {hint && (
          <span className="text-[10px] text-muted-foreground/70">{hint}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="relative cursor-pointer">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <span
            className="block size-11 rounded-xl ring-1 ring-inset ring-foreground/10 shadow-sm"
            style={{ background: value }}
          />
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent border-b border-border focus:border-brand transition-colors py-2 font-mono text-sm focus:outline-none uppercase tracking-wider"
        />
      </div>
    </div>
  );
}
