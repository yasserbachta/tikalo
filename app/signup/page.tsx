"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Brand } from "@/components/layout/Brand";
import { signupAgency } from "@/actions/signup";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await signupAgency({ name, email, password });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push("/onboarding");
        router.refresh();
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-[1.05fr_1fr]">
      {/* Decorative panel — navy field + coral swoosh (mirrors /login) */}
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
          <path
            d="M-40 300 C 160 200, 340 210, 660 150"
            stroke="oklch(0.92 0.012 266)"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.12"
          />
        </svg>

        <div className="relative z-10 flex flex-col justify-between w-full p-12">
          <Brand variant="dark" />

          <div className="space-y-6 max-w-md">
            <p className="eyebrow text-brand">Free trial</p>
            <h1 className="font-display font-bold text-[2.7rem] leading-[1.04] tracking-tight text-sidebar-foreground">
              Start turning PDFs into
              <br />
              <span className="text-brand">tickets</span>, today.
            </h1>
            <p className="text-[15px] leading-relaxed text-sidebar-foreground/70">
              Create your agency workspace in seconds. Your free trial includes
              10 ticket uploads — no card required.
            </p>
            <div className="flex items-center gap-2 pt-2 text-[13px] text-sidebar-foreground/80">
              <Sparkles className="size-4 text-brand" />
              10 free uploads to get you started
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.2em] text-sidebar-foreground/40">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3" /> Secure by design
            </span>
            <span>© Tikalo</span>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center px-6 py-12 lg:px-16">
        <div className="lg:hidden absolute top-6 left-6">
          <Brand variant="light" />
        </div>
        <div className="w-full max-w-md reveal">
          <p className="eyebrow text-brand mb-3">Create account</p>
          <h2 className="font-display font-bold text-3xl lg:text-4xl tracking-tight text-foreground mb-2 leading-tight">
            Start your free trial.
          </h2>
          <span className="swoosh block mb-5" aria-hidden />
          <p className="text-muted-foreground text-[15px] leading-relaxed mb-8">
            Set up your agency workspace. You can refine branding and invite your
            team later.
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-[13px] text-destructive flex items-start gap-2">
                <span className="size-1.5 rounded-full bg-destructive mt-2 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Field label="Agency name">
              <input
                type="text"
                autoComplete="organization"
                placeholder="Mediterranean Voyages"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isPending}
                className="w-full bg-transparent border-0 px-0 py-2.5 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50"
              />
            </Field>

            <Field label="Work email" hint="Used to sign in">
              <input
                type="email"
                autoComplete="email"
                placeholder="you@agency.travel"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isPending}
                className="w-full bg-transparent border-0 px-0 py-2.5 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50"
              />
            </Field>

            <Field label="Password" hint="min 6 characters">
              <div className="flex items-center gap-2">
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="•••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={isPending}
                  className="flex-1 bg-transparent border-0 px-0 py-2.5 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  onClick={() => setShowPw((v) => !v)}
                  className="size-8 grid place-items-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            <button
              type="submit"
              disabled={isPending || !name || !email || password.length < 6}
              className="group mt-2 w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-[14px] tracking-wide shadow-sm hover:brightness-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Creating account…
                </>
              ) : (
                <>
                  Start free trial
                  <ArrowRight className="size-4 nudge-right" />
                </>
              )}
            </button>

            <p className="text-center text-[13px] text-muted-foreground pt-1">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-brand font-medium hover:underline underline-offset-4"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="group block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="eyebrow">{label}</span>
        {hint && (
          <span className="text-[11px] text-muted-foreground/70">{hint}</span>
        )}
      </div>
      <div className="border-b border-border group-focus-within:border-brand transition-colors">
        {children}
      </div>
    </label>
  );
}
