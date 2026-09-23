import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice2Action",
  description: "Turn customer voice feedback into accountable operational work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
