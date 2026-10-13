"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";

/** Baixa a planilha (.xlsx) com os filtros da tela e o período escolhido. */
export function ExportarPlanilha({ unidade, corporativo, mesAtual }: { unidade: string | null; corporativo: boolean; mesAtual: string }) {
  const [aberto, setAberto] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const tresAntes = (() => {
    const [a, m] = mesAtual.split("-").map(Number);
    return new Date(Date.UTC(a, m - 3, 1)).toISOString().slice(0, 7);
  })();
  const [de, setDe] = useState(tresAntes);
  const [ate, setAte] = useState(mesAtual);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [aberto]);

  const baixar = () => {
    const p = new URLSearchParams({ de: de <= ate ? de : ate, ate: de <= ate ? ate : de });
    if (unidade) p.set("unidade", unidade);
    if (corporativo) p.set("segmento", "corporativo");
    setBaixando(true);
    window.location.href = `/api/prevencao/exportar?${p}`;
    // o navegador baixa sem sair da página; libera o botão depois de alguns segundos
    setTimeout(() => { setBaixando(false); setAberto(false); }, 6000);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((x) => !x)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-farol-verde/40 bg-farol-verde/10 px-3 text-xs font-semibold text-farol-verde hover:bg-farol-verde/20"
      >
        <FileSpreadsheet className="h-4 w-4" /> Exportar planilha
      </button>
      {aberto && (
        <div className="absolute left-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] sm:left-auto sm:right-0 space-y-3 rounded-xl border bg-card p-4 shadow-lg">
          <p className="text-sm font-semibold">Planilha da prevenção (Excel)</p>
          <p className="text-xs text-muted-foreground">
            Abas: Resumo, Débito, Pedidos de cancelamento, Insatisfação e Cancelamentos — com nome, IDs, telefone, pedidos
            de cancelamento, boletos em atraso e motivo. Usa a unidade e o filtro de clientes da tela
            {unidade ? ` (${unidade}` : " (todas as unidades"}
            {corporativo ? ", só CNPJ e corporativos)" : ")"}.
          </p>
          <div>
            <p className="mb-1 text-xs font-medium">Período dos pedidos e cancelamentos</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted-foreground">
                De
                <input type="month" value={de} max={mesAtual} onChange={(e) => setDe(e.target.value)} className="mt-0.5 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" />
              </label>
              <label className="text-[11px] text-muted-foreground">
                Até
                <input type="month" value={ate} max={mesAtual} onChange={(e) => setAte(e.target.value)} className="mt-0.5 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" />
              </label>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Débito e insatisfação são sempre a situação de hoje.</p>
          </div>
          <button
            type="button"
            onClick={baixar}
            disabled={baixando || !de || !ate}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-interlig-azul text-sm font-semibold text-white hover:bg-interlig-azul/90 disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> {baixando ? "Gerando a planilha…" : "Baixar .xlsx"}
          </button>
        </div>
      )}
    </div>
  );
}
