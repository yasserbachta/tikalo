import React from "react";
import path from "path";
import fs from "fs";
import { renderToBuffer } from "@react-pdf/renderer";
import { PdfTemplate } from "@prisma/client";
import { TicketData } from "./schema";
import { getTemplate, resolvePalette } from "./templates";
import type { TemplateAgency } from "./templates/types";

let cachedDefaultLogoSrc: string | null = null;

function getDefaultLogoSrc(): string {
  if (cachedDefaultLogoSrc) return cachedDefaultLogoSrc;
  const logoPath = path.join(process.cwd(), "public", "logo.png");
  try {
    const logoBuffer = fs.readFileSync(logoPath);
    cachedDefaultLogoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;
    return cachedDefaultLogoSrc;
  } catch {
    return "";
  }
}

// Renders a ticket PDF using the agency's selected template + palette. The
// template and palette key default to the agency's saved choice, but callers
// (e.g. the admin "Preview" button) can override them to try an unsaved
// selection without persisting it.
export async function generateTicketPdf(
  data: TicketData,
  agency: TemplateAgency,
  opts?: { template?: PdfTemplate; paletteKey?: string },
): Promise<Buffer> {
  const template = opts?.template ?? agency.pdfTemplate;
  const paletteKey = opts?.paletteKey ?? agency.pdfPaletteKey;

  const Template = getTemplate(template);
  const palette = resolvePalette(template, agency, paletteKey);
  const logoSrc = agency.logoSrc ?? getDefaultLogoSrc();

  const doc = React.createElement(Template, {
    data,
    agency: { ...agency, logoSrc },
    palette,
  });
  const buffer = await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
  return Buffer.from(buffer);
}
