import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "BuyRight — Buy with evidence",
  description:
    "An evidence-backed equipment purchasing workspace. Verify compatibility, resolve exceptions, and approve a PayPal sandbox purchase.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
