import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Booth That Builds Itself",
  description: "A live Factory build surface shaped by the people around it.",
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
