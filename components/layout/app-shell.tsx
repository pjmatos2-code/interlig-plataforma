"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Users, TrendingUp, ListChecks, MessagesSquare,
  Target, ShieldCheck, Settings, Trophy, Menu, X, LogOut, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ItemNav } from "@/lib/nav";
import { ROTULO_PERFIL, type Usuario } from "@/lib/tipos";
import { LogoInterlig } from "@/components/marca/logo-interlig";

const ICONES: Record<string, LucideIcon> = {
  LayoutDashboard, Users, TrendingUp, ListChecks, MessagesSquare, Target, ShieldCheck, Settings, Trophy,
};

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

  const links = (
    <nav className="flex flex-col gap-1">
      {itens.map((item) => {
        const Icone = ICONES[item.icone] ?? LayoutDashboard;
        const ativo = caminho === item.href || caminho.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setAberto(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              ativo
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icone className="h-4 w-4 shrink-0" />
            {item.rotulo}
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
        {/* Menu lateral — desktop */}
        <aside className="hidden w-60 shrink-0 border-r bg-background p-3 lg:block">
          <div className="mb-4 px-3 pt-2">
            <p className="truncate text-sm font-medium">{usuario.nome}</p>
            <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
          </div>
          {links}
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
              {links}
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
