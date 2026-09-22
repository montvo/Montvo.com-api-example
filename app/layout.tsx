import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Montvo unlock example", template: "%s · Montvo unlock example" },
  description: "Verifying a Montvo unlock on your own server: one ticket per visit, the billable check, and a claim that only works once.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions add attributes to <html> before React loads. Without this, each one is a hydration warning.
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
