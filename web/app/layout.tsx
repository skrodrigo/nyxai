import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: 'Pumkin',
  description: 'Chat com IA para produtividade e foco',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
