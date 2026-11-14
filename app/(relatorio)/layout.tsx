import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./relatorio.css";

/**
 * Páginas do Relatório Comercial Semanal: fora do menu da plataforma, no
 * visual do modelo da diretoria (Poppins, faixa azul-marinho). Cada página
 * confere o acesso por conta própria.
 */

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-poppins", display: "swap" });

export const metadata: Metadata = { title: "Relatório Comercial Semanal · Interlig" };

export default function LayoutRelatorio({ children }: { children: React.ReactNode }) {
  return <div className={poppins.variable}>{children}</div>;
}
