import type { MetadataRoute } from "next";

/** Web app instalável (03/10/2026): ícone na tela inicial, abre sem a barra do navegador. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Interlig · Inteligência Comercial",
    short_name: "Interlig",
    description: "Vendas, metas, comissões, CRM e fidelidade da Interlig.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0A1638",
    theme_color: "#0A1638",
    icons: [
      { src: "/pwa/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Meu painel", url: "/meu-painel", icons: [{ src: "/pwa/icone-192.png", sizes: "192x192" }] },
      { name: "CRM", url: "/crm", icons: [{ src: "/pwa/icone-192.png", sizes: "192x192" }] },
    ],
  };
}
