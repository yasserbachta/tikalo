import type { ReactElement } from "react";
import type { Agency } from "@prisma/client";
import type { TicketData } from "../schema";
import type { PaletteColors } from "./palettes";

// The full agency record, plus the logo resolved to a base64 data URL at render
// time (the DB only stores a storage path). Templates read branding off this.
export type TemplateAgency = Agency & { logoSrc?: string | null };

// Every PDF template component receives the same props: the validated ticket
// data, the full agency record (+ resolved logo), and the resolved palette.
export type TemplateProps = {
  data: TicketData;
  agency: TemplateAgency;
  palette: PaletteColors;
};

export type TemplateComponent = (props: TemplateProps) => ReactElement;
