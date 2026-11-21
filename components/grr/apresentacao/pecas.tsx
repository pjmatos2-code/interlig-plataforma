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


/**
 * Tamanhos para TV: letras e números crescem com a largura da tela (vw), com
 * piso para notebook e teto para TV grande. Os quadros têm borda forte,
 * sombra e uma faixa de cor no topo, para aparecerem de longe.
 */
export const TV = {
  titulo: "text-[clamp(1.75rem,2.3vw,3.1rem)]",
  sub: "text-[clamp(1rem,1.15vw,1.6rem)]",
  rotulo: "text-[clamp(1rem,1.25vw,1.75rem)]",
  valor: "text-[clamp(2.5rem,4.1vw,6.25rem)]",
  valorMedio: "text-[clamp(2rem,3vw,4.5rem)]",
  detalhe: "text-[clamp(0.9rem,1.05vw,1.45rem)]",
  corpo: "text-[clamp(1rem,1.2vw,1.7rem)]",
  quadro: "rounded-2xl border-2 border-slate-300 bg-white shadow-[0_4px_18px_rgba(10,22,56,0.10)] p-[clamp(0.9rem,1.3vw,2.2rem)]",
} as const;

const FAIXA_STATUS = { ok: "border-t-farol-verde", atencao: "border-t-farol-amarelo", critico: "border-t-farol-vermelho", sem_meta: "border-t-interlig-azul" } as const;

export function Titulo({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="shrink-0">
      <h2 className={cn("font-extrabold leading-tight tracking-tight text-interlig-marinho", TV.titulo)}>{children}</h2>
      {sub && <p className={cn("mt-1 text-slate-600", TV.sub)}>{sub}</p>}
    </div>
  );
}

export function Caixa({ children, className, titulo }: { children: React.ReactNode; className?: string; titulo?: string }) {
  return (
    <section className={cn("min-w-0 border-t-[6px] border-t-interlig-azul", TV.quadro, className)} aria-label={titulo}>
      {titulo && <h3 className={cn("mb-[1.2vh] font-bold text-slate-800", TV.rotulo)}>{titulo}</h3>}
      <div className={TV.corpo}>{children}</div>
    </section>
  );
}

export function Numero({ rotulo, valor, detalhe, destaque, medio = false }: { rotulo: string; valor: string; detalhe?: React.ReactNode; destaque?: boolean; medio?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-center border-t-[6px]", TV.quadro, destaque ? "border-t-interlig-ceu bg-sky-50" : "border-t-interlig-azul")}>
      <p className={cn("font-semibold text-slate-600", TV.rotulo)}>{rotulo}</p>
      <p className={cn("mt-[0.6vh] whitespace-nowrap font-extrabold leading-none tabular-nums tracking-tight text-slate-900", medio || valor.length > 7 ? TV.valorMedio : TV.valor)}>{valor}</p>
      {detalhe && <div className={cn("mt-[1vh] text-slate-600", TV.detalhe)}>{detalhe}</div>}
    </div>
  );
}

export function CartaoGrande({ c }: { c: CartaoPainel }) {
  const Icone = ICONE_DO_GRUPO[c.grupo];
  return (
    <div className={cn("flex min-w-0 flex-col justify-between gap-[1.2vh] border-t-[6px]", TV.quadro, FAIXA_STATUS[c.status])}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={cn("flex items-center gap-2 font-semibold text-slate-700", TV.rotulo)}>
            <Icone className="h-[1.1em] w-[1.1em] shrink-0 text-interlig-azul" aria-hidden /> {c.rotulo}
          </p>
          <p className="mt-[0.8vh] flex flex-wrap items-baseline gap-x-3 tabular-nums">
            <span className={cn("whitespace-nowrap font-extrabold leading-none tracking-tight", c.valor.length > 6 ? TV.valorMedio : TV.valor)}>{c.valor}</span>
            {c.metaNumero != null && c.meta && <span className={cn("font-semibold text-slate-500", TV.rotulo)}>/ {c.meta.replace(/^meta /, "")}</span>}
          </p>
        </div>
        {c.atingimento != null ? (
          <div className="shrink-0">
            <AnelMeta atingimento={c.atingimento} status={c.status} tamanho={128} />
          </div>
        ) : (
          <span className={cn("shrink-0 rounded-full border px-3 py-1 font-semibold", TV.detalhe, SELO_STATUS[c.status])}>{ROTULO_STATUS[c.status]}</span>
        )}
      </div>
      <div className={TV.detalhe}>
        <Evolucao evolucao={c.evolucao} />
        {c.contexto && <p className="mt-0.5 text-slate-600">{c.contexto}</p>}
      </div>
    </div>
  );
}

/** barras horizontais (rótulo, barra e valor), legíveis de longe */
export function Barras({ itens, formato = n0, vazio = "Sem dados no período." }: { itens: { nome: string; valor: number; extra?: string }[]; formato?: (v: number) => string; vazio?: string }) {
  if (!itens.length) return <p className="text-slate-500">{vazio}</p>;
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className={cn("space-y-[1.3vh]", TV.corpo)}>
      {itens.map((i) => (
        <li key={i.nome} className="grid grid-cols-[minmax(0,clamp(8rem,15vw,22rem))_minmax(0,1fr)_auto] items-center gap-[1vw]">
          <span className="truncate font-semibold">{i.nome}</span>
          <span className="h-[clamp(0.8rem,1.2vw,1.6rem)] rounded-r bg-slate-200">
            <span className="block h-full rounded-r bg-interlig-azul" style={{ width: `${(i.valor / max) * 100}%` }} />
          </span>
          <span className="text-right font-bold tabular-nums">
            {formato(i.valor)}
            {i.extra && <span className={cn("ml-2 font-normal text-slate-500", TV.detalhe)}>{i.extra}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Pendente({ etapa, children }: { etapa: number | string; children: React.ReactNode }) {
  return (
    <div className={cn("border-dashed text-slate-600", TV.quadro, "bg-white/70")}>
      <p className={cn("font-semibold uppercase tracking-wide text-slate-500", TV.detalhe)}>Previsto na Etapa {etapa}</p>
      <p className={cn("mt-1", TV.corpo)}>{children}</p>
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

