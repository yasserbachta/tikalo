import type { TicketData } from "./schema";

// A representative one-way flight ticket used to preview a template + palette
// selection before it's saved. Kept realistic enough to exercise the header,
// passenger band, a flight card, the summary band, and the footer.
export function getSampleTicketData(): TicketData {
  return {
    type: "ONE_WAY",
    passengers: [{ name: "AMINA BENALI", ticketNumber: "020-1234567890" }],
    bookingReference: "TKLO42",
    price: "18500",
    currency: "DZD",
    issuedDate: "2026-06-01",
    directions: [
      {
        kind: "OUTBOUND",
        legs: [
          {
            flightNumber: "AH 1006",
            airline: "Air Algérie",
            departureAirport: "ALG",
            departureCity: "Alger",
            arrivalAirport: "CDG",
            arrivalCity: "Paris",
            departureDate: "2026-07-15",
            departureTime: "08:30",
            arrivalDate: "2026-07-15",
            arrivalTime: "11:45",
            cabin: "Economy",
            baggageAllowance: "23 kg",
            aircraft: "Boeing 737-800",
          },
        ],
      },
    ],
    maritimeDirections: undefined,
    showFeeBreakdownInPdf: false,
  };
}
