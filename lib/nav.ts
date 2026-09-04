import type { Perfil } from "@/lib/tipos";

export type ItemNav = {
  href: string;
  rotulo: string;
  icone: string; // nome do ícone lucide-react
  perfis: Perfil[];
};

/**
 * Navegação derivada diretamente da matriz de acesso do PRD (seção 2).
 * Fonte única: mudou a matriz, muda aqui — e a RLS acompanha em 0002_rls.sql.
 */
export const ITENS_NAV: ItemNav[] = [
  { href: "/dashboard",     rotulo: "Dashboard",   icone: "LayoutDashboard", perfis: ["gestor", "supervisor", "direcao"] },
  { href: "/vendedoras",    rotulo: "Vendedoras",  icone: "Users",           perfis: ["gestor", "supervisor", "direcao"] },
  { href: "/minhas-vendas", rotulo: "Minhas vendas", icone: "TrendingUp",    perfis: ["gestor", "supervisor", "vendedora", "vendedora_externa", "agente_corporativo"] },
  { href: "/minha-comissao", rotulo: "Minha comissão", icone: "Wallet",       perfis: ["vendedora", "vendedora_externa", "agente_corporativo", "agente_atendimento"] },
  { href: "/ranking",       rotulo: "Ranking",     icone: "Trophy",          perfis: ["gestor", "supervisor", "vendedora", "vendedora_externa", "direcao"] },
  { href: "/crm",           rotulo: "CRM",         icone: "MessagesSquare",  perfis: ["gestor", "supervisor", "vendedora", "vendedora_externa", "agente_corporativo", "agente_atendimento", "agente_retencao", "direcao"] },
  { href: "/esteira",       rotulo: "Esteira",     icone: "ListChecks",      perfis: ["gestor", "supervisor", "vendedora", "vendedora_externa", "agente_corporativo", "direcao"] },
  { href: "/externa",       rotulo: "Venda Externa", icone: "Footprints",    perfis: ["gestor", "supervisor", "vendedora_externa", "direcao"] },
  { href: "/corporativo",   rotulo: "Setor Corporativo", icone: "Building2", perfis: ["gestor", "agente_corporativo", "direcao"] },
  { href: "/metas",         rotulo: "Metas e comissão", icone: "Target",     perfis: ["gestor", "direcao"] },
  { href: "/gerencia",      rotulo: "Gerência",    icone: "Crown",           perfis: ["gestor", "financeiro", "direcao"] },
  { href: "/refidelizacao", rotulo: "Refidelização", icone: "RefreshCw",     perfis: ["gestor", "direcao"] },
  { href: "/retencao",      rotulo: "Retenção",    icone: "ShieldAlert",     perfis: ["gestor", "agente_retencao", "direcao"] },
  { href: "/tecnica",       rotulo: "Equipe Técnica", icone: "Wrench",       perfis: ["gestor", "financeiro", "gestor_tecnico", "direcao"] },
  { href: "/financeiro",    rotulo: "Financeiro",  icone: "Receipt",         perfis: ["gestor", "financeiro", "direcao"] },
  { href: "/historico",     rotulo: "Histórico",   icone: "History",         perfis: ["gestor", "financeiro", "direcao"] },
  { href: "/qualidade",     rotulo: "Qualidade",   icone: "ShieldCheck",     perfis: ["gestor", "supervisor", "direcao"] },
  { href: "/mapa",          rotulo: "Mapa",        icone: "Map",             perfis: ["gestor", "supervisor", "direcao"] },
  { href: "/admin",         rotulo: "Administração", icone: "Settings",      perfis: ["gestor"] },
];

export function navDoPerfil(perfil: Perfil): ItemNav[] {
  return ITENS_NAV.filter((item) => item.perfis.includes(perfil));
}

export function podeAcessar(perfil: Perfil, caminho: string): boolean {
  const item = ITENS_NAV.find((i) => caminho.startsWith(i.href));
  return item ? item.perfis.includes(perfil) : true;
}
