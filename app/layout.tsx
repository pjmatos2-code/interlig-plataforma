import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./tema-escuro.css";
import { RegistrarServiceWorker } from "@/components/pwa/registrar-sw";
import { SCRIPT_TEMA } from "@/components/layout/interruptor-tema";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Interlig · Inteligência Comercial",
  description: "Vendas, metas, comissionamento, qualidade da venda e CRM da Interlig.",
  applicationName: "Interlig",
  appleWebApp: { capable: true, title: "Interlig", statusBarStyle: "black" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A1638",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        {/* tema escolhido aplicado antes da primeira pintura (sem piscar) */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
