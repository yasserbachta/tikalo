import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { AuthSessionProvider } from "@/providers/session-provider";
import { QueryProvider } from "@/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";

const bodyFont = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const monoFont = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

// Montserrat — geometric display face echoing the logo's "T"
const displayFont = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "../public/fonts/montserrat-400.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/montserrat-500.ttf", weight: "500", style: "normal" },
    { path: "../public/fonts/montserrat-600.ttf", weight: "600", style: "normal" },
    { path: "../public/fonts/montserrat-700.ttf", weight: "700", style: "normal" },
    { path: "../public/fonts/montserrat-800.ttf", weight: "800", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Tikalo — Ticket Workspace for Travel Agencies",
  description:
    "Extract, refine, and export passenger tickets in one fast, modern workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${monoFont.variable} ${displayFont.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <AuthSessionProvider>
          <QueryProvider>
            {children}
            <Toaster />
          </QueryProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
