import { TicketStatus, ExtractionStatus } from "@prisma/client";
import { TicketData } from "@/lib/tickets/schema";
import type { PdfEdit } from "@/lib/tickets/pdf-edits";

export interface TicketListItem {
  id: string;
  reference: string | null;
  status: TicketStatus;
  createdAt: string;
  extractionStatus: ExtractionStatus | null;
  type: string | null;
  passengerName: string | null;
  routeSummary: string | null;
  departureDate: string | null;
  agency: { id: string; name: string } | null;
}

export interface TicketVersion {
  id: string;
  ticketId: string;
  versionNumber: number;
  isLatest: boolean;
  originalFileName: string;
  originalStoragePath: string;
  fileSize: number;
  extractedData: TicketData | null;
  extractionStatus: ExtractionStatus;
  modelUsed: string | null;
  wasRetried: boolean;
  processingMs: number | null;
  confirmedData: TicketData | null;
  // Maritime PDF editor text edits (empty when none / flag never used).
  pdfEdits: PdfEdit[];
  generatedPdfPath: string | null;
  exportedAt: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
}

export interface TicketDetail {
  id: string;
  reference: string | null;
  status: TicketStatus;
  createdById: string;
  agencyId: string;
  createdAt: string;
  updatedAt: string;
  versions: TicketVersion[];
  // Feature flag (per agency + global kill switch), resolved server-side.
  maritimeEditorEnabled: boolean;
}
