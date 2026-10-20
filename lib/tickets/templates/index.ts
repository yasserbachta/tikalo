import { PdfTemplate } from "@prisma/client";
import { ClassicTemplate } from "./classic";
import { EditorialTemplate } from "./editorial";
import { PremiumTemplate } from "./premium";
import { BoldTemplate } from "./bold";
import { WalletTemplate } from "./wallet";
import { TimelineTemplate } from "./timeline";
import { resolvePaletteColors, type PaletteColors } from "./palettes";
import type { TemplateAgency, TemplateComponent } from "./types";

export const TEMPLATE_REGISTRY: Partial<Record<PdfTemplate, TemplateComponent>> =
  {
    CLASSIC: ClassicTemplate,
    EDITORIAL: EditorialTemplate,
    PREMIUM: PremiumTemplate,
    BOLD: BoldTemplate,
    WALLET: WalletTemplate,
    TIMELINE: TimelineTemplate,
  };

// Returns the component for a template, falling back to CLASSIC for templates
// that aren't implemented yet (the selection still persists in the DB; the
// rendering catches up as each template lands).
export function getTemplate(template: PdfTemplate): TemplateComponent {
  return TEMPLATE_REGISTRY[template] ?? ClassicTemplate;
}

// Resolves the palette colors handed to a template at render time. The palette
// is template-independent: "custom" derives from the agency's own primary /
// secondary colors (the original CLASSIC logic), predefined keys come from the
// unified catalog. All six templates — CLASSIC included — brand off the result.
export function resolvePalette(
  _template: PdfTemplate,
  agency: TemplateAgency,
  paletteKey: string,
): PaletteColors {
  return resolvePaletteColors(
    paletteKey,
    agency.primaryColor,
    agency.secondaryColor,
  );
}
