"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, TrendingUp, ListChecks, MessagesSquare,
  Target, ShieldCheck, Settings, Trophy, Map, Menu, X, LogOut,
  PanelLeftClose, PanelLeftOpen, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ItemNav } from "@/lib/nav";
import { ROTULO_PERFIL, type Usuario } from "@/lib/tipos";
import { LogoInterlig } from "@/components/marca/logo-interlig";

const ICONES: Record<string, LucideIcon> = {
  LayoutDashboard, Users, TrendingUp, ListChecks, MessagesSquare, Target, ShieldCheck, Settings, Trophy, Map,
};

const CHAVE_RECOLHIDO = "interlig-menu-recolhido";

export function AppShell({
  usuario,
  itens,
  atualizadoEm,
  children,
}: {
  usuario: Usuario;
  itens: ItemNav[];
  atualizadoEm: string;
  children: React.ReactNode;
}) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  // menu lateral recolhido (desktop) — preferência lembrada no navegador
  const [recolhido, setRecolhido] = useState(false);
  useEffect(() => {
    setRecolhido(localStorage.getItem(CHAVE_RECOLHIDO) === "1");
  }, []);
  function alternarRecolhido() {
    setRecolhido((v) => {
      localStorage.setItem(CHAVE_RECOLHIDO, v ? "0" : "1");
      return !v;
    });
  }

  const renderLinks = (compacto: boolean) => (
    <nav className="flex flex-col gap-1">
      {itens.map((item) => {
        const Icone = ICONES[item.icone] ?? LayoutDashboard;
        const ativo = caminho === item.href || caminho.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setAberto(false)}
            title={compacto ? item.rotulo : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md py-2.5 text-sm font-medium transition-colors",
              compacto ? "justify-center px-0" : "px-3",
              ativo
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icone className="h-4 w-4 shrink-0" />
            {!compacto && item.rotulo}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Barra superior — mobile-first (CLAUDE.md), no marinho da marca */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/10 bg-interlig-marinho px-4 text-white lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setAberto((v) => !v)}
          aria-label="Abrir menu"
        >
          {aberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        <Link href="/" className="flex items-center" aria-label="Início">
          <LogoInterlig variante="clara" tamanho="sm" />
        </Link>
        <span className="hidden text-sm text-white/60 md:inline">· Inteligência Comercial</span>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-white/60 sm:inline">{atualizadoEm}</span>
          <Badge className="border-transparent bg-interlig-ceu/25 text-interlig-claro">
            {ROTULO_PERFIL[usuario.perfil]}
          </Badge>
          <form action="/api/sair" method="post">
            <Button
              variant="ghost"
              size="icon"
              type="submit"
              aria-label="Sair"
              title="Sair"
              className="text-white/80 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </header>

      <div className="flex">
        {/* Menu lateral — desktop (recolhível) */}
        <aside
          className={cn(
            "hidden shrink-0 border-r bg-background p-3 transition-[width] duration-200 lg:block",
            recolhido ? "w-16" : "w-60"
          )}
        >
          <div className={cn("mb-2 flex", recolhido ? "justify-center" : "justify-end")}>
            <Button
              variant="ghost"
              size="icon"
              onClick={alternarRecolhido}
              aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
              title={recolhido ? "Expandir menu" : "Recolher menu"}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              {recolhido ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>
          {!recolhido && (
            <div className="mb-4 px-3">
              <p className="truncate text-sm font-medium">{usuario.nome}</p>
              <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
            </div>
          )}
          {renderLinks(recolhido)}
        </aside>

        {/* Menu lateral — mobile */}
        {aberto && (
          <div className="fixed inset-0 z-20 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAberto(false)} />
            <aside className="absolute left-0 top-14 h-full w-64 border-r bg-background p-3">
              <div className="mb-4 px-3 pt-2">
                <p className="truncate text-sm font-medium">{usuario.nome}</p>
                <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
              </div>
              {renderLinks(false)}
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
