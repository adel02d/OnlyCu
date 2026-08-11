import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OnlyCu - Creadores en Telegram",
  description: "Plataforma de suscripciones para creadores cubanos en Telegram Mini App. QvaPay + Cripto + CUP. +18",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" async></script>
      </head>
      <body className="bg-black text-white antialiased">
        {children}
      </body>
    </html>
  );
}
