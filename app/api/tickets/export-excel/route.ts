import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx-js-style";
import { auth } from "@/auth";
import { getTicketScope } from "@/lib/auth";
import { migrateTicketData } from "@/lib/tickets/schema";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agencyId, isSuperAdmin } = await getTicketScope();

    let statusFilter: "CONFIRMED" | "EXPORTED" | undefined;
    try {
      const body = await req.json();
      if (body.status === "CONFIRMED" || body.status === "EXPORTED") {
        statusFilter = body.status;
      }
    } catch {
      // No body or invalid JSON
    }

    const where: Prisma.TicketWhereInput = {
      status: statusFilter ? statusFilter : { in: ["CONFIRMED", "EXPORTED"] },
    };

    if (!isSuperAdmin && agencyId) {
      where.agencyId = agencyId;
    }

    const tickets = await db.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        versions: {
          where: { isLatest: true },
          take: 1,
        },
      },
    });

    const rows: Record<string, unknown>[] = [];

    for (const ticket of tickets) {
      const version = ticket.versions[0];
      if (!version) continue;

      const raw = version.confirmedData ?? version.extractedData;
      const data = migrateTicketData(raw);
      if (!data) continue;

      const passengerNames = data.passengers
        .map((p) => p.name)
        .join(", ");

      const DIRECTION_LABELS: Record<string, string> = {
        OUTBOUND: "Aller",
        RETURN: "Retour",
        ONWARD: "Autre",
      };

      if (data.type === "MARITIME" && data.maritimeDirections && data.maritimeDirections.length > 0) {
        const legs = data.maritimeDirections.flatMap((dir) =>
          dir.legs.map((leg) => ({ leg, kind: dir.kind })),
        );
        legs.forEach(({ leg: m, kind }, idx) => {
          rows.push({
            "Type": "Maritime",
            "Segment": `${idx + 1}/${legs.length} ${DIRECTION_LABELS[kind] ?? kind}`,
            "Passenger(s)": passengerNames,
            "Ship / Airline": m.company,
            "Ship Name": m.shipName,
            "Flight Number": "—",
            "From": [m.departurePort, m.departureCity].filter(Boolean).join(" - "),
            "To": [m.arrivalPort, m.arrivalCity].filter(Boolean).join(" - "),
            "Departure Date": m.departureDate ?? "",
            "Departure Time": m.departureTime ?? "",
            "Arrival Date": m.arrivalDate ?? "",
            "Arrival Time": m.arrivalTime ?? "",
            "Seat": "—",
            "Cabin": m.cabinType ?? "",
            "Baggage": "—",
            "Vehicle": m.hasVehicle
              ? [m.vehicleType, m.vehiclePlate].filter(Boolean).join(" - ")
              : "",
            "Price": idx === 0 ? (data.price ?? "") : "",
            "Currency": idx === 0 ? (data.currency ?? "") : "",
            "PNR / Booking Ref": idx === 0 ? (data.bookingReference ?? "") : "",
            "Ticket Number": idx === 0 ? (data.passengers[0]?.ticketNumber ?? "") : "",
            "Status": ticket.status,
            "Extracted On": version.createdAt.toISOString().split("T")[0],
          });
        });
      } else if (data.directions && data.directions.length > 0) {
        const typeLabel =
          data.type === "ONE_WAY"
            ? "Aller simple"
            : data.type === "ROUND_TRIP"
            ? "Aller-retour"
            : "Multi-destinations";

        const legs = data.directions.flatMap((dir) =>
          dir.legs.map((leg) => ({ leg, kind: dir.kind })),
        );
        legs.forEach(({ leg: seg, kind }, idx) => {
          rows.push({
            "Type": typeLabel,
            "Segment": `${idx + 1}/${legs.length} ${DIRECTION_LABELS[kind] ?? kind}`,
            "Passenger(s)": passengerNames,
            "Ship / Airline": seg.airline,
            "Ship Name": "—",
            "Flight Number": seg.flightNumber,
            "From": [seg.departureAirport, seg.departureCity].filter(Boolean).join(" - "),
            "To": [seg.arrivalAirport, seg.arrivalCity].filter(Boolean).join(" - "),
            "Departure Date": seg.departureDate ?? "",
            "Departure Time": seg.departureTime ?? "",
            "Arrival Date": seg.arrivalDate ?? "",
            "Arrival Time": seg.arrivalTime ?? "",
            "Seat": seg.seatNumber ?? "",
            "Cabin": seg.cabin ?? "",
            "Baggage": seg.baggageAllowance ?? "",
            "Vehicle": "",
            "Price": idx === 0 ? (data.price ?? "") : "",
            "Currency": idx === 0 ? (data.currency ?? "") : "",
            "PNR / Booking Ref": idx === 0 ? (data.bookingReference ?? "") : "",
            "Ticket Number": idx === 0 ? (data.passengers[0]?.ticketNumber ?? "") : "",
            "Status": ticket.status,
            "Extracted On": version.createdAt.toISOString().split("T")[0],
          });
        });
      }
    }

    if (rows.length === 0) {
      rows.push({ "Info": "No tickets to export" });
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);

    const headers = Object.keys(rows[0] ?? {});
    headers.forEach((_, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = { font: { bold: true } };
      }
    });

    const colWidths: XLSX.ColInfo[] = [
      { wch: 14 }, { wch: 18 }, { wch: 26 }, { wch: 18 }, { wch: 18 },
      { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 12 },
      { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
      { wch: 12 }, { wch: 14 },
    ];
    worksheet["!cols"] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tickets");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const date = new Date().toISOString().split("T")[0];

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="tickets-export-${date}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[TICKETS_EXPORT_EXCEL]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
