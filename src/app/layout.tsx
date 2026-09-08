import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Replacement Desk", template: "%s · Replacement Desk" },
  description: "Manage replacement printing, quality checks, packing, and dispatch.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
