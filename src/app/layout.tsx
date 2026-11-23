import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Equipo de agentes IA · Orquestador, Develop y Testing",
  description: "Tres agentes de IA que se reparten una petición de desarrollo web y la llevan hasta que todo pasa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-gray-900 text-xs text-white">3A</span>
              Equipo de agentes IA
            </Link>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="hidden sm:inline">Orquestador · Develop · Testing</span>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
