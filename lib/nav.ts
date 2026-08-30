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
  { href: "/dashboard",     rotulo: "Dashboard",   icone: "LayoutDashboard", perfis: ["gestor", "supervisor"] },
  { href: "/vendedoras",    rotulo: "Vendedoras",  icone: "Users",           perfis: ["gestor", "supervisor"] },
  { href: "/minhas-vendas", rotulo: "Minhas vendas", icone: "TrendingUp",    perfis: ["gestor", "supervisor", "vendedora", "vendedora_externa", "agente_corporativo"] },
  { href: "/ranking",       rotulo: "Ranking",     icone: "Trophy",          perfis: ["gestor", "supervisor", "vendedora", "vendedora_externa", "agente_corporativo"] },
  { href: "/crm",           rotulo: "CRM",         icone: "MessagesSquare",  perfis: ["gestor", "supervisor", "vendedora", "vendedora_externa", "agente_corporativo"] },
  { href: "/esteira",       rotulo: "Esteira",     icone: "ListChecks",      perfis: ["gestor", "supervisor", "vendedora", "vendedora_externa", "agente_corporativo"] },
  { href: "/externa",       rotulo: "Venda Externa", icone: "Footprints",    perfis: ["gestor", "supervisor", "vendedora_externa"] },
  { href: "/corporativo",   rotulo: "Setor Corporativo", icone: "Building2", perfis: ["gestor", "supervisor", "agente_corporativo"] },
  { href: "/metas",         rotulo: "Metas e comissão", icone: "Target",     perfis: ["gestor"] },
  { href: "/refidelizacao", rotulo: "Refidelização", icone: "RefreshCw",     perfis: ["gestor"] },
  { href: "/financeiro",    rotulo: "Financeiro",  icone: "Receipt",         perfis: ["gestor", "financeiro"] },
  { href: "/qualidade",     rotulo: "Qualidade",   icone: "ShieldCheck",     perfis: ["gestor", "supervisor"] },
  { href: "/mapa",          rotulo: "Mapa",        icone: "Map",             perfis: ["gestor", "supervisor"] },
  { href: "/admin",         rotulo: "Administração", icone: "Settings",      perfis: ["gestor"] },
];

export function navDoPerfil(perfil: Perfil): ItemNav[] {
  return ITENS_NAV.filter((item) => item.perfis.includes(perfil));
}

export function podeAcessar(perfil: Perfil, caminho: string): boolean {
  const item = ITENS_NAV.find((i) => caminho.startsWith(i.href));
  return item ? item.perfis.includes(perfil) : true;
}
