"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Meu Dia abre no primeiro acesso de cada dia (14/10/2026) — também para quem
 * já estava logada (app instalado), não só no login.
 */
export function AbrirMeuDia() {
  const router = useRouter();
  const caminho = usePathname();
  useEffect(() => {
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    try {
      if (localStorage.getItem("meu-dia-aberto") === hoje) return;
      localStorage.setItem("meu-dia-aberto", hoje);
    } catch {
      return; // sem armazenamento local: não força nada
    }
    if (!caminho.startsWith("/meu-dia")) router.replace("/meu-dia");
  }, [caminho, router]);
  return null;
}
