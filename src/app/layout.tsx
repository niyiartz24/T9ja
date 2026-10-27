import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ticket9ja",
  description: "Discover events and buy tickets with secure, single-use QR entry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
