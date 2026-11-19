import { cn } from "@/lib/utils";
import type { LinhaQuebra } from "@/lib/grr/montar";
import type { CartaoPainel } from "@/lib/grr/painel";
import { AnelMeta, Evolucao } from "@/components/grr/painel/destaque";
import { ICONE_DO_GRUPO, ROTULO_STATUS, SELO_STATUS } from "@/components/grr/painel/icones";

/** peças das telas do Modo Apresentação (letras grandes, pouca informação por tela) */

export const n0 = (v: number) => v.toLocaleString("pt-BR");
export const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
export const reais = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v >= 1000 ? 0 : 2 }));
export const dataBr = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "");
export const dataHora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} às ${d.slice(11, 16)}`;
};


export function Titulo({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-2xl font-bold tracking-tight text-interlig-marinho sm:text-3xl xl:text-4xl">{children}</h2>
      {sub && <p className="mt-1 text-base text-slate-600 xl:text-lg">{sub}</p>}
    </div>
  );
}

export function Caixa({ children, className, titulo }: { children: React.ReactNode; className?: string; titulo?: string }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm", className)} aria-label={titulo}>
      {titulo && <h3 className="mb-3 text-lg font-semibold text-slate-800 xl:text-xl">{titulo}</h3>}
      {children}
    </section>
  );
}

export function Numero({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: React.ReactNode; destaque?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border bg-white p-5 shadow-sm", destaque ? "border-interlig-azul/30" : "border-slate-200")}>
      <p className="text-sm font-medium text-slate-600 xl:text-base">{rotulo}</p>
      <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-slate-900 xl:text-5xl">{valor}</p>
      {detalhe && <div className="mt-1 text-sm text-slate-600 xl:text-base">{detalhe}</div>}
    </div>
  );
}

export function CartaoGrande({ c }: { c: CartaoPainel }) {
  const Icone = ICONE_DO_GRUPO[c.grupo];
  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-semibold text-slate-700 xl:text-lg">
            <Icone className="h-5 w-5 shrink-0 text-interlig-azul" aria-hidden /> {c.rotulo}
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 tabular-nums">
            <span className="text-4xl font-bold tracking-tight xl:text-5xl">{c.valor}</span>
            {c.metaNumero != null && c.meta && <span className="text-xl font-medium text-slate-500">/ {c.meta.replace(/^meta /, "")}</span>}
          </p>
        </div>
        {c.atingimento != null ? (
          <AnelMeta atingimento={c.atingimento} status={c.status} tamanho={84} />
        ) : (
          <span className={cn("shrink-0 rounded-full border px-3 py-1 text-sm font-medium", SELO_STATUS[c.status])}>{ROTULO_STATUS[c.status]}</span>
        )}
      </div>
      <div className="text-sm xl:text-base">
        <Evolucao evolucao={c.evolucao} />
        {c.contexto && <p className="mt-0.5 text-slate-600">{c.contexto}</p>}
      </div>
    </div>
  );
}

/** barras horizontais simples (rótulo, barra e valor), legíveis de longe */
export function Barras({ itens, formato = n0, vazio = "Sem dados no período." }: { itens: { nome: string; valor: number; extra?: string }[]; formato?: (v: number) => string; vazio?: string }) {
  if (!itens.length) return <p className="text-slate-500">{vazio}</p>;
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.nome} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm xl:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] xl:text-base">
          <span className="truncate font-medium">{i.nome}</span>
          <span className="h-3 rounded-r bg-slate-100">
            <span className="block h-3 rounded-r bg-interlig-ceu" style={{ width: `${(i.valor / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums">
            {formato(i.valor)}
            {i.extra && <span className="ml-1 font-normal text-slate-500">{i.extra}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Pendente({ etapa, children }: { etapa: number | string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5 text-slate-600">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Previsto na Etapa {etapa}</p>
      <p className="mt-1 text-base">{children}</p>
    </div>
  );
}

/** tabela completa por agente, aberta por cima da apresentação */
export function TabelaAgentes({ linhas }: { linhas: LinhaQuebra[] }) {
  const cab = ["Agente", "Vendas", "Semana ant.", "Ativações", "Receita", "Ticket", "Leads atend.", "Viraram venda", "Conv. safra", "Conv. CRM", "Perdidos"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            {cab.map((c, i) => (
              <th key={c} className={cn("py-2 font-medium", i > 0 && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map((l) => (
            <tr key={l.id} className="border-b last:border-0">
              <td className="py-2 font-medium">
                {l.nome}
                {l.detalhe && <span className="block text-xs font-normal text-slate-500">{l.detalhe}</span>}
              </td>
              <td className="text-right font-semibold">{n0(l.vendas)}</td>
              <td className="text-right">{n0(l.vendasAnterior)}</td>
              <td className="text-right">{n0(l.ativacoes)}</td>
              <td className="text-right">{reais(l.receita)}</td>
              <td className="text-right">{reais(l.ticket)}</td>
              <td className="text-right">{n0(l.safraAtendidos)}</td>
              <td className="text-right">{n0(l.safraConvertidos)}</td>
              <td className="text-right">{pct(l.safraTaxa)}</td>
              <td className="text-right">{pct(l.conversao)}</td>
              <td className="text-right">{n0(l.perdidos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

