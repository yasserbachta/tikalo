import { Agency, PdfTemplate } from "@prisma/client";
import { generateTicketPdf } from "./generate-pdf";
import { getSampleTicketData } from "./sample";
import { downloadFromBunny } from "./bunny";

// Builds a sample-data PDF for a given agency using an (often unsaved) template +
// palette selection, so admins/agency users can preview a choice before saving.
// `colors` optionally overrides the saved agency colors so an unsaved custom
// palette previews accurately too.
export async function buildPreviewPdf(
  agency: Agency,
  template: PdfTemplate,
  paletteKey: string,
  colors?: { primaryColor?: string; secondaryColor?: string },
): Promise<Buffer> {
  let logoSrc: string | null = null;
  if (agency.logoPath) {
    try {
      const logoBuffer = await downloadFromBunny(agency.logoPath);
      const ext = agency.logoPath.split(".").pop()?.toLowerCase() ?? "png";
      const mime = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
      logoSrc = `data:${mime};base64,${logoBuffer.toString("base64")}`;
    } catch {
      // Logo not found — preview without it.
    }
  }

  return generateTicketPdf(
    getSampleTicketData(),
    {
      ...agency,
      primaryColor: colors?.primaryColor ?? agency.primaryColor,
      secondaryColor: colors?.secondaryColor ?? agency.secondaryColor,
      logoSrc,
    },
    { template, paletteKey },
  );
}
