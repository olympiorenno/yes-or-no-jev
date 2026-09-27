import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sim ou Não · Sorteio, Numerologia e IA",
  description: "Faça uma pergunta de sim ou não e escolha: sorteio, numerologia por diversão ou uma análise com IA (Jev).",
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
