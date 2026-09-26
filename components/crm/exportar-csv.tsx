"use client";

import { useState } from "react";

/**
 * Exportação do CRM com filtros (pedido do gestor, 26/09/2026): situação,
 * etapa do funil, vendedora e intervalo de datas → baixa a planilha CSV.
 */
export function ExportarCsv({
  vendedoras,
  de,
  ate,
  mostrarVendedora,
}: {
  vendedoras: { id: string; nome: string }[];
  de: string;
  ate: string;
  mostrarVendedora: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [situacao, setSituacao] = useState("todos");
  const [etapa, setEtapa] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [dataDe, setDataDe] = useState(de);
  const [dataAte, setDataAte] = useState(ate);

  const baixar = () => {
    const p = new URLSearchParams({ de: dataDe, ate: dataAte, situacao });
    if (etapa) p.set("etapa", etapa);
    if (vendedor) p.set("vendedor", vendedor);
    window.location.href = `/api/crm/exportar?${p.toString()}`;
  };

  const selectCls =
    "h-9 rounded-lg border border-white/70 bg-white/80 px-2 text-xs font-medium text-slate-700";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="rounded-xl border border-white/60 bg-white/55 px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-xl hover:bg-white/80"
      >
        ⬇ Exportar
      </button>
      {aberto && (
        <div className="absolute right-0 z-30 mt-2 w-72 space-y-2.5 rounded-2xl border border-white/60 bg-white/95 p-3.5 shadow-lg backdrop-blur-xl">
          <p className="text-xs font-bold text-slate-700">Exportar planilha (CSV)</p>

          <label className="block text-[11px] font-semibold text-slate-500">
            Situação
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className={`${selectCls} mt-1 w-full`}>
              <option value="todos">Todos os tickets</option>
              <option value="abertos">Em aberto</option>
              <option value="convertido">Convertidos (vendidas)</option>
              <option value="nao_convertido">Não convertidos (perdidas)</option>
            </select>
          </label>

          <label className="block text-[11px] font-semibold text-slate-500">
            Etapa do funil
            <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className={`${selectCls} mt-1 w-full`}>
              <option value="">Todas</option>
              <option value="pre_cadastro">Pré-Cadastro</option>
              <option value="novo">Sem contato</option>
              <option value="em_atendimento">Contato inicial</option>
              <option value="aguardando">Criação do contrato</option>
            </select>
          </label>

          {mostrarVendedora && (
            <label className="block text-[11px] font-semibold text-slate-500">
              Vendedora
              <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} className={`${selectCls} mt-1 w-full`}>
                <option value="">Todas</option>
                {vendedoras.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
            </label>
          )}

          <div className="flex gap-2">
            <label className="block flex-1 text-[11px] font-semibold text-slate-500">
              De
              <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} className={`${selectCls} mt-1 w-full`} />
            </label>
            <label className="block flex-1 text-[11px] font-semibold text-slate-500">
              Até
              <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} className={`${selectCls} mt-1 w-full`} />
            </label>
          </div>

          <p className="text-[10px] leading-snug text-slate-400">
            Em aberto/todos: período pela criação do ticket. Vendidas e perdidas: pela data de
            fechamento.
          </p>

          <button
            type="button"
            onClick={baixar}
            className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
          >
            Baixar planilha
          </button>
        </div>
      )}
    </div>
  );
}
