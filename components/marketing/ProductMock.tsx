import { Plane, ScanLine, Check } from "lucide-react";

/**
 * Hero visual — a self-contained "before → after" that shows the core value
 * without a screenshot: a raw airline PDF on the left, the clean structured
 * ticket Tikalo produces on the right, joined by an "auto-extracted" seam.
 * Pure markup so it stays crisp at any size and needs no image asset.
 */
export function ProductMock() {
  return (
    <div className="relative">
      {/* Soft coral glow behind the composition */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(at 30% 20%, oklch(0.90 0.07 40 / 0.55) 0px, transparent 55%), radial-gradient(at 85% 90%, oklch(0.88 0.05 266 / 0.45) 0px, transparent 55%)",
        }}
      />

      <div className="grid grid-cols-[1fr_auto_1.15fr] items-center gap-3 sm:gap-4">
        {/* Source PDF */}
        <div className="paper p-4 sm:p-5 rotate-[-2deg]">
          <p className="eyebrow mb-3">e-ticket.pdf</p>
          <div className="space-y-2" aria-hidden>
            <div className="h-2 w-3/4 rounded-full bg-muted" />
            <div className="h-2 w-full rounded-full bg-muted" />
            <div className="relative h-2 w-5/6 rounded-full bg-muted">
              {/* scan highlight */}
              <span className="absolute -inset-y-1 -inset-x-1 rounded bg-brand/15 ring-1 ring-brand/40" />
            </div>
            <div className="h-2 w-2/3 rounded-full bg-muted" />
            <div className="h-2 w-full rounded-full bg-muted" />
            <div className="h-2 w-1/2 rounded-full bg-muted" />
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
            <ScanLine className="size-3 text-brand" />
            reading…
          </div>
        </div>

        {/* Seam */}
        <div className="flex flex-col items-center gap-2">
          <span className="hidden sm:block text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            auto
          </span>
          <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Plane className="size-4" />
          </span>
          <span className="hidden sm:block text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            extract
          </span>
        </div>

        {/* Structured ticket */}
        <div className="boarding p-5 sm:p-6 rotate-[1.5deg]">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow text-brand">Boarding · confirmed</p>
              <p className="display text-lg font-bold mt-1">A. MARCHETTI</p>
            </div>
            <span className="grid size-8 place-items-center rounded-lg bg-sidebar text-sidebar-foreground">
              <Plane className="size-4" />
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="display text-2xl font-bold leading-none">GVA</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Geneva</p>
            </div>
            <div className="flex-1 px-3 pb-1.5">
              <div className="relative h-px bg-border">
                <Plane className="absolute right-0 -top-2 size-3.5 text-brand" />
              </div>
            </div>
            <div className="text-right">
              <p className="display text-2xl font-bold leading-none">JFK</p>
              <p className="mt-1 text-[11px] text-muted-foreground">New York</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4">
            {[
              ["Flight", "LX 22"],
              ["Seat", "14A"],
              ["Fare", "$842"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="eyebrow">{k}</p>
                <p className="mt-0.5 text-sm font-semibold">{v}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-brand">
            <Check className="size-3.5" />
            Ready to send
          </div>
        </div>
      </div>
    </div>
  );
}
