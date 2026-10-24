import { BarChart3 } from "lucide-react";
import { AbasPerformance, type Aba } from "@/components/performance/abas";
import { exigirEscopo } from "@/lib/performance/escopo";

export const dynamic = "force-dynamic";

/**
 * Performance Comercial — Interlig Performance Intelligence (24/10/2026).
 * Cada tela aplica o escopo no servidor; as abas só mostram o que o papel
 * do usuário pode abrir.
 */
export default async function LayoutPerformance({ children }: { children: React.ReactNode }) {
  const escopo = await exigirEscopo();
  const abas: Aba[] =
    escopo.papel === "vendedor"
      ? [
          { href: "/performance/vendedor/eu", rotulo: "Meu desempenho" },
          { href: "/performance/ranking", rotulo: "Ranking" },
          { href: "/performance/followups", rotulo: "Meus follow-ups" },
        ]
      : [
          { href: "/performance", rotulo: "Visão geral" },
          { href: "/performance/ranking", rotulo: "Ranking" },
          { href: "/performance/esforco", rotulo: "Esforço comercial" },
          { href: "/performance/funil", rotulo: "Funil e conversão" },
          { href: "/performance/followups", rotulo: "Follow-ups" },
          { href: "/performance/qualidade", rotulo: "Qualidade das vendas" },
          { href: "/performance/conversas", rotulo: "Inteligência das conversas" },
          { href: "/performance/alertas", rotulo: "Alertas e oportunidades" },
          { href: "/performance/relatorios", rotulo: "Relatórios e metas" },
          ...(escopo.podeConfigurar ? [{ href: "/performance/configuracoes", rotulo: "Configurações" }] : []),
        ];
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-interlig-azul text-white">
          <BarChart3 className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Performance Comercial</h1>
          <p className="text-sm text-muted-foreground">Esforço, resultado e qualidade do time — com dados reais do chat, do CRM e do SGP.</p>
        </div>
      </div>
      <AbasPerformance abas={abas} />
      {children}
    </div>
  );
}
