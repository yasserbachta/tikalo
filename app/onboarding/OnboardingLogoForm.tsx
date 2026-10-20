"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Brand } from "@/components/layout/Brand";
import { LogoUpload } from "@/components/layout/LogoUpload";
import { updateMyAgency } from "@/actions/agencies";

interface OnboardingLogoFormProps {
  cdnHost?: string;
  agency: { name: string; logoPath: string | null };
}

export function OnboardingLogoForm({ cdnHost, agency }: OnboardingLogoFormProps) {
  const router = useRouter();

  const [logoPath, setLogoPath] = useState<string | null>(agency.logoPath);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initials =
    agency.name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "AG";

  const goToApp = () => {
    router.push("/tickets");
    router.refresh();
  };

  const onContinue = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateMyAgency({ logoPath });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        goToApp();
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-[1.05fr_1fr]">
      {/* Decorative panel — navy field + coral swoosh (mirrors /signup) */}
      <div className="hidden lg:flex relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(at 18% 12%, oklch(0.34 0.10 266) 0px, transparent 55%), radial-gradient(at 90% 88%, oklch(0.28 0.09 266) 0px, transparent 55%)",
          }}
        />

        <svg
          aria-hidden
          viewBox="0 0 600 800"
          className="absolute inset-0 w-full h-full"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="coral" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.70 0.20 30)" />
              <stop offset="100%" stopColor="oklch(0.78 0.16 50)" />
            </linearGradient>
          </defs>
          <path
            d="M-60 560 C 180 380, 360 360, 680 470"
            stroke="url(#coral)"
            strokeWidth="34"
            strokeLinecap="round"
            opacity="0.9"
          />
          <path
            d="M-60 620 C 200 470, 380 450, 680 540"
            stroke="oklch(0.66 0.20 33)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.35"
          />
        </svg>

        <div className="relative z-10 flex flex-col justify-between w-full p-12">
          <Brand variant="dark" />

          <div className="space-y-6 max-w-md">
            <p className="eyebrow text-brand">Welcome aboard</p>
            <h1 className="font-display font-bold text-[2.7rem] leading-[1.04] tracking-tight text-sidebar-foreground">
              One last touch —
              <br />
              your <span className="text-brand">logo</span>.
            </h1>
            <p className="text-[15px] leading-relaxed text-sidebar-foreground/70">
              Add your agency logo so it shows in the sidebar and on every ticket
              PDF you export. You can always change it later in settings.
            </p>
            <div className="flex items-center gap-2 pt-2 text-[13px] text-sidebar-foreground/80">
              <Sparkles className="size-4 text-brand" />
              Optional — skip it and set it up any time
            </div>
          </div>

          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-sidebar-foreground/40">
            © Tikalo
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center px-6 py-12 lg:px-16">
        <div className="lg:hidden absolute top-6 left-6">
          <Brand variant="light" />
        </div>
        <div className="w-full max-w-md reveal">
          <p className="eyebrow text-brand mb-3">Set up branding</p>
          <h2 className="font-display font-bold text-3xl lg:text-4xl tracking-tight text-foreground mb-2 leading-tight">
            Add your logo.
          </h2>
          <span className="swoosh block mb-5" aria-hidden />
          <p className="text-muted-foreground text-[15px] leading-relaxed mb-8">
            Upload your agency logo to personalize your workspace and exported
            tickets. This step is optional.
          </p>

          <div className="space-y-6">
            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-[13px] text-destructive flex items-start gap-2">
                <span className="size-1.5 rounded-full bg-destructive mt-2 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <LogoUpload
              value={logoPath}
              onChange={setLogoPath}
              cdnHost={cdnHost}
              initials={initials}
              uploadEndpoint="/api/tickets/settings/upload-logo"
            />

            <button
              type="button"
              onClick={onContinue}
              disabled={isPending}
              className="group mt-2 w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-[14px] tracking-wide shadow-sm hover:brightness-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  Continue to dashboard
                  <ArrowRight className="size-4 nudge-right" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={goToApp}
              disabled={isPending}
              className="w-full text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
