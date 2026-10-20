import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Layers,
  Palette,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { Brand } from "@/components/layout/Brand";
import { ProductMock } from "@/components/marketing/ProductMock";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tikalo.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Tikalo — Turn airline PDFs into passenger-ready tickets in minutes",
  description:
    "Tikalo reads any airline e-ticket, extracts every passenger, flight and fee automatically, and exports a clean, branded ticket ready to send. Built for travel agencies. Start free — 10 tickets, no card.",
  keywords: [
    "travel agency software",
    "e-ticket extraction",
    "airline PDF parser",
    "passenger ticket generator",
    "travel document automation",
    "itinerary maker",
    "ticket workspace",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Tikalo",
    title: "Tikalo — From PDF to passenger-ready ticket in minutes",
    description:
      "Extract, refine and export passenger tickets in one fast, modern workspace built for travel agencies.",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "Tikalo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tikalo — Ticket workspace for travel agencies",
    description:
      "Upload an airline PDF, let Tikalo extract every detail, and export a branded ticket in minutes.",
    images: ["/logo.png"],
  },
  robots: { index: true, follow: true },
};

const steps = [
  {
    icon: Upload,
    title: "Upload the PDF",
    body: "Drop in any airline e-ticket. Tikalo handles the formats you already receive every day.",
  },
  {
    icon: ScanLine,
    title: "Let Tikalo extract",
    body: "Passengers, flights, baggage and fees are read and organized in seconds. You just glance and confirm.",
  },
  {
    icon: ArrowRight,
    title: "Export & send",
    body: "Pick a template, add your logo and fare, and download a polished ticket your traveler will love.",
  },
];

const features = [
  {
    icon: Sparkles,
    title: "Automatic extraction",
    body: "AI reads unstructured PDFs so you never retype a name, route or flight number again.",
  },
  {
    icon: Layers,
    title: "Six ready templates",
    body: "Classic, Editorial, Premium, Bold, Wallet and Timeline — switch the whole look with one click.",
  },
  {
    icon: Palette,
    title: "Your branding",
    body: "Stamp your agency logo and colors onto every ticket for a consistent, professional finish.",
  },
  {
    icon: Tag,
    title: "Smart price overlay",
    body: "Set the fare your client should see and Tikalo places it cleanly on the document.",
  },
  {
    icon: Users,
    title: "Built for teams",
    body: "A shared workspace for your whole agency, with roles and access that keep things tidy.",
  },
  {
    icon: Zap,
    title: "Fast by design",
    body: "From upload to send in under a minute — even on your busiest booking days.",
  },
];

const reasons = [
  "No training or manual to read",
  "Works with any airline PDF",
  "Nothing to install — runs in your browser",
  "Your data stays encrypted end to end",
];

const faqs = [
  {
    q: "What is Tikalo?",
    a: "Tikalo is a ticket workspace for travel agencies. It reads airline e-ticket PDFs, extracts the passenger and flight details automatically, and lets you export a clean, branded ticket to send to your travelers.",
  },
  {
    q: "Which PDFs does it work with?",
    a: "Tikalo is built to read the airline e-tickets and itineraries agencies receive every day, across many carriers and formats. You upload the PDF as-is — no special preparation needed.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Tikalo runs entirely in your browser. Create your workspace, upload a PDF and you're working within a couple of minutes.",
  },
  {
    q: "What does the free trial include?",
    a: "Your free trial includes 10 ticket uploads with no credit card required. Upgrade to Premium for unlimited uploads whenever you're ready.",
  },
  {
    q: "Can I use my own branding?",
    a: "Yes. Upload your agency logo and choose from six templates so every ticket carries your identity and colors.",
  },
  {
    q: "Is my data secure?",
    a: "Yes. Tikalo is secure by design, with end-to-end encryption protecting the documents you upload and generate.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Tikalo",
      url: siteUrl,
      logo: `${siteUrl}/logo.png`,
      description:
        "Ticket workspace for travel agencies — extract, refine and export passenger tickets from airline PDFs.",
    },
    {
      "@type": "SoftwareApplication",
      name: "Tikalo",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: siteUrl,
      description:
        "Tikalo reads any airline e-ticket, extracts every passenger, flight and fee automatically, and exports a clean, branded ticket ready to send.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free trial — 10 ticket uploads, no credit card required.",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ---- Header ---- */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Brand href="/" variant="light" />
          <nav className="hidden items-center gap-8 text-sm text-ink-soft md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a
              href="#features"
              className="transition-colors hover:text-foreground">
              Features
            </a>
            <a
              href="#pricing"
              className="transition-colors hover:text-foreground">
              Pricing
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-brand sm:inline-flex">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="group inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:brightness-105">
              Start free
              <ArrowRight className="size-4 nudge-right" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---- Hero ---- */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
            <div className="reveal">
              <p className="eyebrow text-brand">
                Ticket workspace for travel agencies
              </p>
              <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
                From messy PDF to
                <br />
                <span className="text-brand">passenger-ready</span> ticket,
                <br className="hidden sm:block" /> in minutes.
              </h1>
              <span className="swoosh mt-6 block" aria-hidden />
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-soft">
                Tikalo reads any airline e-ticket, pulls out every passenger,
                flight and fee automatically, and hands you a clean, branded
                document ready to send. No retyping. No templates to wrestle.
                Just upload and go.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/signup"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:brightness-105">
                  Start free — 10 tickets
                  <ArrowRight className="size-4 nudge-right" />
                </Link>
                <a
                  href="#how"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-[15px] font-semibold text-foreground transition-colors hover:border-brand/40">
                  See how it works
                </a>
              </div>

              <p className="mt-5 flex items-center gap-2 text-[13px] text-muted-foreground">
                <ShieldCheck className="size-4 text-brand" />
                No credit card required · Set up in under 2 minutes
              </p>
            </div>

            <div className="reveal" style={{ animationDelay: "120ms" }}>
              <ProductMock />
            </div>
          </div>

          {/* Destinations strip */}
          <div className="border-y border-border/60 bg-parchment-deep/60">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-5 sm:px-8">
              <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Serving 40+ destinations
              </span>
              <div className="flex items-center gap-2.5">
                {["GVA", "JFK", "DXB", "CDG", "LHR", "SIN"].map((c) => (
                  <span
                    key={c}
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-ink-soft">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---- How it works ---- */}
        <section id="how" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow text-brand">How it works</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Three steps. That&apos;s the whole job.
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-ink-soft">
                What used to take careful copy-pasting now takes a glance.
                Here&apos;s everything you do.
              </p>
            </div>

            <ol className="mt-14 grid gap-6 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="paper relative p-7">
                  <span className="absolute right-6 top-6 font-display text-4xl font-extrabold text-brand/15">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="grid size-11 place-items-center rounded-xl bg-accent text-brand">
                    <s.icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---- Features ---- */}
        <section id="features" className="scroll-mt-20 bg-parchment-deep/50">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <p className="eyebrow text-brand">Everything included</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Small enough to learn in a minute, powerful enough to run your
                desk.
              </h2>
            </div>

            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="paper group p-6 transition-shadow duration-200 hover:shadow-md">
                  <span className="grid size-11 place-items-center rounded-xl bg-accent text-brand transition-colors">
                    <f.icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Why it's easy ---- */}
        <section>
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-2">
            <div>
              <p className="eyebrow text-brand">Made for people, not manuals</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                If you can send an email, you can run Tikalo.
              </h2>
              <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-ink-soft">
                There&apos;s no setup project, no onboarding call, no
                spreadsheet to maintain. Upload a ticket and the workspace does
                the reading for you — so your team spends time on travelers, not
                typing.
              </p>
              <ul className="mt-8 space-y-3">
                {reasons.map((r) => (
                  <li key={r} className="flex items-center gap-3 text-[15px]">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-brand">
                      <Check className="size-3.5" />
                    </span>
                    <span className="text-foreground">{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="paper p-8">
              <div className="grid grid-cols-3 divide-x divide-border text-center">
                {[
                  ["< 1 min", "upload to export"],
                  ["6", "ready templates"],
                  ["0", "fields to retype"],
                ].map(([big, small]) => (
                  <div key={small} className="px-3">
                    <p className="font-display text-3xl font-extrabold text-foreground">
                      {big}
                    </p>
                    <p className="mt-1 text-[12px] leading-tight text-muted-foreground">
                      {small}
                    </p>
                  </div>
                ))}
              </div>
              <div className="horizon-rule my-7" />
              <blockquote className="text-[15px] leading-relaxed text-ink-soft">
                “We used to rebuild every itinerary by hand. Now the ticket is
                ready before the client finishes their coffee.”
              </blockquote>
              <p className="mt-4 text-[13px] font-medium">
                A travel desk that switched to Tikalo
              </p>
            </div>
          </div>
        </section>

        {/* ---- Pricing / CTA band ---- */}
        <section id="pricing" className="scroll-mt-20 px-5 pb-20 sm:px-8">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-sidebar px-6 py-16 text-sidebar-foreground sm:px-14 sm:py-20">
            <svg
              aria-hidden
              viewBox="0 0 600 400"
              className="absolute inset-0 h-full w-full"
              fill="none"
              preserveAspectRatio="xMidYMid slice">
              <defs>
                <linearGradient id="ctaCoral" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="oklch(0.70 0.20 30)" />
                  <stop offset="100%" stopColor="oklch(0.78 0.16 50)" />
                </linearGradient>
              </defs>
              <path
                d="M-60 300 C 180 180, 380 180, 680 260"
                stroke="url(#ctaCoral)"
                strokeWidth="30"
                strokeLinecap="round"
                opacity="0.85"
              />
              <path
                d="M-60 350 C 200 250, 400 240, 680 320"
                stroke="oklch(0.66 0.20 33)"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.3"
              />
            </svg>

            <div className="relative z-10 mx-auto max-w-2xl text-center">
              <p className="eyebrow text-brand">Start free</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-sidebar-foreground sm:text-4xl">
                Your first 10 tickets are on us.
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-sidebar-foreground/70">
                Create your agency workspace, upload a PDF and see the finished
                ticket for yourself. No credit card, no commitment — upgrade to
                unlimited whenever it clicks.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-[15px] font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:brightness-105">
                  Create your workspace
                  <ArrowRight className="size-4 nudge-right" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 px-7 text-[15px] font-semibold text-sidebar-foreground transition-colors hover:bg-white/5">
                  Sign in
                </Link>
              </div>
              <p className="mt-6 text-[11px] font-mono uppercase tracking-[0.2em] text-sidebar-foreground/45">
                Free trial: 10 uploads · Premium: unlimited
              </p>
            </div>
          </div>
        </section>

        {/* ---- FAQ ---- */}
        <section id="faq" className="scroll-mt-20">
          <div className="mx-auto max-w-3xl px-5 pb-24 sm:px-8">
            <div className="text-center">
              <p className="eyebrow text-brand">Questions</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Everything you might be wondering.
              </h2>
            </div>
            <div className="mt-12 divide-y divide-border border-y border-border">
              {faqs.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold text-foreground">
                    {f.q}
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-transform duration-200 group-open:rotate-45">
                      <span className="text-lg leading-none">+</span>
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ---- Footer ---- */}
      <footer className="border-t border-border bg-parchment-deep/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 py-10 sm:flex-row sm:px-8">
          <Brand href="/" variant="light" />
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-ink-soft">
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a
              href="#features"
              className="transition-colors hover:text-foreground">
              Features
            </a>
            <a
              href="#pricing"
              className="transition-colors hover:text-foreground">
              Pricing
            </a>
            <Link
              href="/login"
              className="transition-colors hover:text-foreground">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="transition-colors hover:text-foreground">
              Start free
            </Link>
          </nav>
          <p className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <ShieldCheck className="size-3" />© {new Date().getFullYear()}{" "}
            Tikalo
          </p>
        </div>
      </footer>
    </>
  );
}
