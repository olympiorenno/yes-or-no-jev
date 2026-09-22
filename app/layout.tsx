import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sim ou Não · Pergunte ao Jev",
  description: "Perguntas livres com respostas Sim, Não ou Inconclusivo. Conecte sua conta TypeSafe e consulte o Jev.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
