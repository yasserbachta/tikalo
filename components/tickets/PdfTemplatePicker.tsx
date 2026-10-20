"use client";

import { useMemo, useState } from "react";
import { PdfTemplate } from "@prisma/client";
import { Check, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEMPLATE_META } from "@/lib/tickets/templates/meta";
import {
  BRAND_PALETTES,
  CUSTOM_PALETTE_KEY,
  normalizePaletteKey,
  resolvePaletteColors,
} from "@/lib/tickets/templates/palettes";
import { TicketMiniature } from "@/components/tickets/TicketMiniature";

interface PdfTemplatePickerProps {
  template: PdfTemplate;
  paletteKey: string;
  onTemplateChange: (template: PdfTemplate) => void;
  onPaletteChange: (paletteKey: string) => void;
  // Agency brand colors — drive the "custom" palette (the CLASSIC logic, now
  // shared by every template).
  primaryColor: string;
  secondaryColor: string;
  // When provided, the custom palette exposes inline color editors. Omit them
  // if the colors are edited elsewhere on the page (e.g. the admin form).
  onPrimaryColorChange?: (hex: string) => void;
  onSecondaryColorChange?: (hex: string) => void;
  // POST endpoint that accepts { template, paletteKey, primaryColor,
  // secondaryColor } and returns a PDF blob.
  previewEndpoint: string;
}

export function PdfTemplatePicker({
  template,
  paletteKey,
  onTemplateChange,
  onPaletteChange,
  primaryColor,
  secondaryColor,
  onPrimaryColorChange,
  onSecondaryColorChange,
  previewEndpoint,
}: PdfTemplatePickerProps) {
  const [previewing, setPreviewing] = useState(false);

  // Legacy keys ("default", old per-template names) resolve to a valid entry
  // so the UI always has a coherent selection.
  const activeKey = normalizePaletteKey(paletteKey);
  const isCustom = activeKey === CUSTOM_PALETTE_KEY;
  const editable = Boolean(onPrimaryColorChange && onSecondaryColorChange);

  const colors = useMemo(
    () => resolvePaletteColors(activeKey, primaryColor, secondaryColor),
    [activeKey, primaryColor, secondaryColor],
  );

  const activeName = isCustom
    ? "Couleurs de l'agence"
    : (BRAND_PALETTES.find((p) => p.key === activeKey)?.name ?? "");
  const templateName =
    TEMPLATE_META.find((m) => m.key === template)?.name ?? "";

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      // Only forward colors that are valid hex — the free-text input may hold
      // a partial value mid-typing.
      const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
      const res = await fetch(previewEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template,
          paletteKey: activeKey,
          ...(isHex(primaryColor) ? { primaryColor } : {}),
          ...(isHex(secondaryColor) ? { secondaryColor } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error("La génération de l'aperçu a échoué");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // Revoke a bit later so the new tab has time to load it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Impossible de générer l'aperçu",
      );
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* ------------------------------------------------ controls column */}
      <div className="min-w-0 space-y-8">
        {/* Step 1 — template */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Modèle
            </p>
            <p className="truncate text-[12px] font-medium text-foreground">
              {templateName}
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Modèle de billet PDF"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {TEMPLATE_META.map((meta) => {
              const selected = meta.key === template;
              return (
                <button
                  key={meta.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={meta.description}
                  onClick={() => onTemplateChange(meta.key)}
                  className={cn(
                    "group relative cursor-pointer rounded-xl border p-2 pb-2.5 text-left transition-colors duration-200",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected
                      ? "border-foreground bg-foreground/[.03] ring-1 ring-foreground"
                      : "border-border hover:border-foreground/35",
                  )}
                >
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-full bg-foreground text-background shadow-sm">
                      <Check className="size-3" />
                    </span>
                  )}
                  {/* Live thumbnail — recolors with the current palette */}
                  <div
                    className={cn(
                      "flex justify-center overflow-hidden rounded-lg bg-muted/40 py-2 ring-1 ring-inset ring-foreground/[.06] transition-opacity",
                      !selected && "opacity-80 group-hover:opacity-100",
                    )}
                  >
                    <div className="overflow-hidden rounded-[3px] shadow-[0_1px_8px_rgba(0,0,0,.12)]">
                      <TicketMiniature
                        template={meta.key}
                        colors={colors}
                        width={92}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-center text-[12px] font-medium text-foreground">
                    {meta.name}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 2 — colors */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Couleurs
            </p>
            <p className="truncate text-[12px] font-medium text-foreground">
              {activeName}
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Palette de couleurs"
            className="flex flex-wrap items-center gap-2.5"
          >
            {/* Custom — the agency's own colors */}
            <Swatch
              selected={isCustom}
              name="Couleurs de l'agence"
              onSelect={() => onPaletteChange(CUSTOM_PALETTE_KEY)}
              background={`linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor} 55%, ${secondaryColor} 55%, ${secondaryColor} 100%)`}
            />
            <span aria-hidden className="h-6 w-px bg-border" />
            {BRAND_PALETTES.map((p) => (
              <Swatch
                key={p.key}
                selected={activeKey === p.key}
                name={p.name}
                onSelect={() => onPaletteChange(p.key)}
                background={p.brand}
              />
            ))}
          </div>

          {isCustom &&
            (editable ? (
              <div className="space-y-2.5 rounded-xl border border-border bg-muted/30 p-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="pdf-primary-color"
                      className="text-[11px] uppercase tracking-wider text-muted-foreground"
                    >
                      Couleur principale
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="pdf-primary-color"
                        type="color"
                        value={primaryColor}
                        onChange={(e) => onPrimaryColorChange?.(e.target.value)}
                        className="h-9 w-12 shrink-0 cursor-pointer p-1"
                      />
                      <Input
                        aria-label="Couleur principale (hex)"
                        value={primaryColor}
                        onChange={(e) => onPrimaryColorChange?.(e.target.value)}
                        className="h-9 font-mono text-[13px] uppercase"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="pdf-secondary-color"
                      className="text-[11px] uppercase tracking-wider text-muted-foreground"
                    >
                      Couleur de fond
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="pdf-secondary-color"
                        type="color"
                        value={secondaryColor}
                        onChange={(e) =>
                          onSecondaryColorChange?.(e.target.value)
                        }
                        className="h-9 w-12 shrink-0 cursor-pointer p-1"
                      />
                      <Input
                        aria-label="Couleur de fond (hex)"
                        value={secondaryColor}
                        onChange={(e) =>
                          onSecondaryColorChange?.(e.target.value)
                        }
                        className="h-9 font-mono text-[13px] uppercase"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  La couleur principale habille l&apos;en-tête, les accents et
                  le total ; la couleur de fond teinte les bandeaux clairs.
                  Choisissez un fond clair pour garder le document lisible.
                </p>
              </div>
            ) : (
              <p className="text-[11px] leading-snug text-muted-foreground">
                Utilise les couleurs primaire et secondaire de l&apos;agence
                définies ci-dessus.
              </p>
            ))}
        </section>
      </div>

      {/* ------------------------------------------------ live preview column */}
      <aside className="min-w-0">
        <div className="space-y-3 lg:sticky lg:top-4">
          <div
            className="flex justify-center rounded-xl border border-border px-4 py-5"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(120,120,120,.14) 1px, transparent 1px)",
              backgroundSize: "12px 12px",
            }}
          >
            <div
              key={template}
              className="animate-in fade-in zoom-in-[.98] overflow-hidden rounded-[4px] shadow-[0_10px_34px_rgba(0,0,0,.16)] duration-300"
            >
              <TicketMiniature template={template} colors={colors} width={236} />
            </div>
          </div>
          <div className="flex items-center justify-between px-0.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Aperçu en direct · A4
            </p>
            <p className="truncate text-[11px] font-medium text-foreground">
              {templateName} — {activeName}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handlePreview}
            disabled={previewing}
          >
            {previewing ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Génération…
              </>
            ) : (
              <>
                <Eye className="size-4" /> Aperçu PDF réel
              </>
            )}
          </Button>
          <p className="text-center text-[11px] leading-snug text-muted-foreground">
            Génère un PDF d&apos;exemple avec la sélection actuelle, sans
            l&apos;enregistrer.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Swatch({
  selected,
  name,
  background,
  onSelect,
}: {
  selected: boolean;
  name: string;
  background: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={name}
      title={name}
      onClick={onSelect}
      className={cn(
        "relative grid size-9 cursor-pointer place-items-center rounded-full ring-1 ring-inset ring-foreground/10 transition-shadow duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected &&
          "ring-2 ring-foreground ring-offset-2 ring-offset-background",
      )}
      style={{ background }}
    >
      {selected && <Check className="size-4 text-white drop-shadow" />}
    </button>
  );
}
