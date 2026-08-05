import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowMate",
  description: "GD/VE workflow and workload MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
