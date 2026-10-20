import { PdfTemplate } from "@prisma/client";

// Display metadata for the template picker UI. Order here is the order shown in
// the picker grid.
export const TEMPLATE_META: {
  key: PdfTemplate;
  name: string;
  description: string;
}[] = [
  {
    key: "CLASSIC",
    name: "Classic",
    description: "Le design d'origine — bandeau d'en-tête et blocs colorés.",
  },
  {
    key: "EDITORIAL",
    name: "Document Élégant",
    description: "Mise en page éditoriale épurée, typographie soignée.",
  },
  {
    key: "PREMIUM",
    name: "Itinéraire Premium",
    description: "Itinéraire détaillé au style premium et contrasté.",
  },
  {
    key: "BOLD",
    name: "Modern Bold",
    description: "Design moderne, couleurs franches et titres marqués.",
  },
  {
    key: "WALLET",
    name: "Wallet Pass",
    description: "Format compact inspiré des cartes d'embarquement.",
  },
  {
    key: "TIMELINE",
    name: "Timeline",
    description: "Itinéraire présenté en chronologie verticale.",
  },
];
