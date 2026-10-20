"use client";

import TicketUploadForm from "@/components/tickets/TicketUploadForm";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";

export default function UploadPage() {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        eyebrow="Upload"
        breadcrumbs={[
          { label: "Tickets", href: "/tickets" },
          { label: "New ticket" },
        ]}
        title={
          <>
            Add a new <span className="text-brand">ticket</span>.
          </>
        }
        description="Drop the e-ticket and we'll extract passengers, segments, baggage, and fees — everything you need to issue a clean travel document."
      />
      <div className="mt-10">
        <TicketUploadForm />
      </div>
    </PageContainer>
  );
}
