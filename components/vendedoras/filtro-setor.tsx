"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ROTULO_SETOR, type SetorAgente } from "@/lib/tipos";

const SETORES: SetorAgente[] = [
  "comercial_interno",
  "comercial_externo",
  "atendimento",
  "corporativo",
];

/**
 * Filtro por setor do painel. Sem seleção, o painel mostra todos — inclusive a
 * refidelização, cujo "resultado" são planos refidelizados e não vendas.
 */
export function FiltroSetor({ atual }: { atual: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function trocar(valor: string) {
    const p = new URLSearchParams(params.toString());
    if (valor) p.set("setor", valor);
    else p.delete("setor");
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <select
      value={atual ?? ""}
      onChange={(e) => trocar(e.target.value)}
      className="mb-5 h-10 rounded-md border border-input bg-background px-3 text-sm"
      aria-label="Filtrar por setor"
    >
      <option value="">Todos os setores</option>
      {SETORES.map((s) => (
        <option key={s} value={s}>
          {ROTULO_SETOR[s]}
        </option>
      ))}
    </select>
  );
}
