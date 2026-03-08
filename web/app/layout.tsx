import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: 'NyxAI',
  description: 'Chat com IA para produtividade e foco',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="h-dvh overflow-hidden" suppressHydrationWarning>{children}</body>
    </html>
  );
}
