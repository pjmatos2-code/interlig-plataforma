import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { percentualMeta } from "@/lib/indicadores/regras";
import { dec1, num, pct, reais, reais2 } from "@/lib/relatorio-semanal/formato";
import type { GrupoGrr } from "@/lib/grr/catalogo";
import type { LinhaQuebra, LinhaTicket, PontoSemana } from "@/lib/grr/montar";

type Coluna = { rotulo: string; valor: (l: LinhaQuebra) => string; /** número que decide se a linha tem o que mostrar (meta não conta) */ numero?: (l: LinhaQuebra) => number };

const traco = "—";
const C: Record<string, Coluna> = {
  vendas: { rotulo: "Vendas", valor: (l) => num(l.vendas), numero: (l) => l.vendas },
  anterior: { rotulo: "Sem. anterior", valor: (l) => num(l.vendasAnterior), numero: (l) => l.vendasAnterior },
  mes: { rotulo: "No mês", valor: (l) => num(l.vendasMes), numero: (l) => l.vendasMes },
  meta: { rotulo: "Meta do mês", valor: (l) => (l.metaMes != null ? num(l.metaMes) : traco) },
  atingimento: { rotulo: "% da meta", valor: (l) => (l.metaMes ? pct(percentualMeta(l.vendasMes, l.metaMes)) : traco) },
  ativacoes: { rotulo: "Ativações", valor: (l) => num(l.ativacoes), numero: (l) => l.ativacoes },
  recebidos: { rotulo: "Leads recebidos", valor: (l) => num(l.recebidos), numero: (l) => l.recebidos },
  atendidos: { rotulo: "Atendidos", valor: (l) => num(l.atendidos), numero: (l) => l.atendidos },
  fechados: { rotulo: "Fechados", valor: (l) => num(l.fechados), numero: (l) => l.fechados },
  convertidos: { rotulo: "Convertidos", valor: (l) => num(l.convertidos), numero: (l) => l.convertidos },
  conversao: { rotulo: "Conversão do CRM", valor: (l) => (l.conversao != null ? pct(l.conversao) : traco) },
  safraAtendidos: { rotulo: "Leads atendidos", valor: (l) => num(l.safraAtendidos), numero: (l) => l.safraAtendidos },
  safraConvertidos: { rotulo: "Viraram venda", valor: (l) => num(l.safraConvertidos), numero: (l) => l.safraConvertidos },
  safraTaxa: { rotulo: "Conversão por safra", valor: (l) => (l.safraTaxa != null ? pct(l.safraTaxa) : traco) },
  receita: { rotulo: "Receita nova", valor: (l) => reais(l.receita), numero: (l) => l.receita },
  ticket: { rotulo: "Ticket médio", valor: (l) => (l.ticket != null ? reais2(l.ticket) : traco) },
  perdidos: { rotulo: "Perdidos", valor: (l) => num(l.perdidos), numero: (l) => l.perdidos },
  negociacao: { rotulo: "Em negociação", valor: (l) => num(l.emNegociacao), numero: (l) => l.emNegociacao },
};

export const COLUNAS_DO_GRUPO: Record<GrupoGrr, Coluna[]> = {
  vendas: [C.vendas, C.anterior, C.mes, C.meta, C.atingimento],
  ativacoes: [C.ativacoes, C.vendas],
  conversao: [C.safraAtendidos, C.safraConvertidos, C.safraTaxa, C.fechados, C.convertidos, C.conversao],
  receita: [C.receita, C.ticket, C.vendas],
  produtividade: [C.recebidos, C.safraAtendidos, C.vendas, C.safraTaxa, C.anterior],
  perdas: [C.perdidos, C.negociacao, C.fechados],
};

/** Quebra por unidade, equipe ou agente. No celular rola para os lados dentro do próprio quadro. */
export function TabelaQuebra({
  titulo,
  nota,
  linhas: todas,
  colunas,
  link,
  sempre,
}: {
  titulo: string;
  nota?: string;
  linhas: LinhaQuebra[];
  colunas: Coluna[];
  link?: (l: LinhaQuebra) => string | null;
  /** linhas que aparecem mesmo zeradas (o time do recorte) */
  sempre?: (l: LinhaQuebra) => boolean;
}) {
  const linhas = todas.filter((l) => sempre?.(l) || colunas.some((c) => (c.numero?.(l) ?? 0) > 0));
  if (linhas.length === 0) return null;
  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2 font-medium">
                Nome
              </th>
              {colunas.map((c) => (
                <th key={c.rotulo} scope="col" className="px-3 py-2 text-right font-medium">
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const destino = link?.(l) ?? null;
              return (
                <tr key={l.id} className="border-b last:border-0">
                  <th scope="row" className="max-w-[11rem] px-4 py-2 text-left font-medium">
                    {destino ? (
                      <Link href={destino} className="text-interlig-azul hover:underline">
                        {l.nome}
                      </Link>
                    ) : (
                      l.nome
                    )}
                    {l.detalhe && <span className="block text-xs font-normal text-muted-foreground">{l.detalhe}</span>}
                  </th>
                  {colunas.map((c) => (
                    <td key={c.rotulo} className="px-3 py-2 text-right tabular-nums">
                      {c.valor(l)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export type MetricaEvolucao = { rotulo: string; valor: (p: PontoSemana) => number | null; texto: (v: number) => string };

export const METRICA_DO_GRUPO: Partial<Record<GrupoGrr, MetricaEvolucao>> = {
  vendas: { rotulo: "Vendas por semana", valor: (p) => p.vendas, texto: num },
  ativacoes: { rotulo: "Ativações por semana", valor: (p) => p.ativacoes, texto: num },
  conversao: { rotulo: "Conversão do CRM por semana de fechamento", valor: (p) => p.conversao, texto: pct },
  receita: { rotulo: "Receita nova por semana", valor: (p) => p.receita, texto: reais },
  produtividade: { rotulo: "Leads recebidos por semana", valor: (p) => p.recebidos, texto: num },
  perdas: { rotulo: "Perdidos por semana", valor: (p) => p.perdidos, texto: num },
};

export const METRICA_SAFRA: MetricaEvolucao = { rotulo: "Conversão por safra, pela semana em que o lead chegou", valor: (p) => p.safraTaxa, texto: pct };

/** Evolução das últimas semanas, em barras: a semana em foco fica em azul. */
export function EvolucaoSemanas({ pontos, metrica, foco }: { pontos: PontoSemana[]; metrica: MetricaEvolucao; foco: string }) {
  const valores = pontos.map((p) => metrica.valor(p));
  const maximo = Math.max(0, ...valores.map((v) => v ?? 0));
  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold">{metrica.rotulo}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Últimas {pontos.length} semanas, de segunda a domingo.</p>
      <ol className="mt-3 space-y-1.5">
        {pontos.map((p, i) => {
          const v = valores[i];
          return (
            <li key={p.inicio} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 text-xs">
              <span className={p.inicio === foco ? "font-semibold" : "text-muted-foreground"}>{p.rotulo}</span>
              <span className="h-3 rounded-sm bg-muted">
                <span
                  className={`block h-3 rounded-sm ${p.inicio === foco ? "bg-interlig-azul" : "bg-interlig-claro"}`}
                  style={{ width: v != null && maximo > 0 ? `${Math.max(2, (v / maximo) * 100)}%` : "0%" }}
                />
              </span>
              <span className="text-right font-medium tabular-nums">{v == null ? traco : metrica.texto(v)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const ROTULO_SITUACAO: Record<LinhaTicket["situacao"], string> = { convertido: "Convertido", perdido: "Perdido", fora: "Fora da conversão", aberto: "Em negociação" };
const VARIANTE_SITUACAO = { convertido: "verde", perdido: "vermelho", fora: "outline", aberto: "secondary" } as const;
const dia = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
};

const PRIMEIROS = 30;

function ItemTicket({ t }: { t: LinhaTicket }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
      <Link href={`/crm/${t.id}`} className="min-w-0 flex-1 basis-40 truncate font-medium text-interlig-azul hover:underline">
        {t.cliente}
      </Link>
      <span className="text-xs text-muted-foreground">
        {t.agente ?? "Sem agente"}
        {t.unidade ? ` · ${t.unidade}` : ""} · criado {dia(t.criadoEm)}
        {t.fechadoEm ? ` · fechado ${dia(t.fechadoEm)}` : ""}
      </span>
      <span className="flex items-center gap-1.5">
        {t.semLead && <Badge variant="outline">venda direta no SGP</Badge>}
        <Badge variant={VARIANTE_SITUACAO[t.situacao]}>
          {ROTULO_SITUACAO[t.situacao]}
          {t.motivo ? `: ${t.motivo}` : ""}
        </Badge>
      </span>
    </li>
  );
}

/** Tickets que compõem os indicadores da semana, com link para a ficha no CRM. Os primeiros aparecem; o resto abre sob pedido. */
export function ListaTickets({ tickets, titulo, nota }: { tickets: LinhaTicket[]; titulo: string; nota?: string }) {
  if (tickets.length === 0) return null;
  const resto = tickets.slice(PRIMEIROS);
  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">
          {titulo} <span className="font-normal text-muted-foreground">({num(tickets.length)})</span>
        </h3>
        {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
      </div>
      <ul className="divide-y">
        {tickets.slice(0, PRIMEIROS).map((t) => (
          <ItemTicket key={t.id} t={t} />
        ))}
      </ul>
      {resto.length > 0 && (
        <details className="border-t">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-interlig-azul">Mostrar os outros {num(resto.length)}</summary>
          <ul className="divide-y border-t">
            {resto.map((t) => (
              <ItemTicket key={t.id} t={t} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Lista de pares rótulo e valor para os números de apoio de um grupo. */
export function Numeros({ itens }: { itens: { rotulo: string; valor: string; nota?: string }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-3">
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{i.rotulo}</dt>
          <dd className="text-base font-semibold tabular-nums">{i.valor}</dd>
          {i.nota && <dd className="text-xs text-muted-foreground">{i.nota}</dd>}
        </div>
      ))}
    </dl>
  );
}

export { dec1 };
