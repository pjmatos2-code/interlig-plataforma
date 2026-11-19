import { CheckCircle2, CircleAlert, Info, XCircle } from "lucide-react";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { AreasGrr } from "@/components/grr/areas";
import { SeletorSemana } from "@/components/grr/painel/controles";
import { exigirPerfil } from "@/lib/auth";
import { agentesImpossiveis, conferirSemana, resumoConferencia, type StatusVerificacao, type Verificacao } from "@/lib/grr/conferencia";
import { extrasDaConferencia } from "@/lib/grr/conferencia-dados";
import { carregarCadastroGrr, carregarGrrComercial } from "@/lib/grr/dados";
import { resolverEscopo } from "@/lib/grr/escopo";
import { resolverSemana, semanasVizinhas } from "@/lib/grr/semana";
import { hojeSantarem, mesDeReferencia, rotuloSemana } from "@/lib/relatorio-semanal/periodo";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ICONE: Record<StatusVerificacao, typeof Info> = { ok: CheckCircle2, atencao: CircleAlert, erro: XCircle, info: Info };
const COR: Record<StatusVerificacao, string> = { ok: "text-green-700", atencao: "text-amber-600", erro: "text-red-700", info: "text-interlig-ceu" };
const ROTULO: Record<StatusVerificacao, string> = { ok: "Confere", atencao: "Atenção", erro: "Não confere", info: "Para saber" };
const GRUPOS: { chave: Verificacao["grupo"]; titulo: string }[] = [
  { chave: "somas", titulo: "Somas e taxas" },
  { chave: "leads", titulo: "Leads e atribuição" },
  { chave: "vendas", titulo: "Vendas e reconciliação com o SGP" },
  { chave: "fontes", titulo: "Outras fontes" },
];
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/**
 * Conferência dos dados do GRR (Etapa 5), para a diretoria: a semana da
 * empresa verificada contra ela mesma (somas, taxas), contra o CRM e o SGP
 * (atribuição de leads, vendas sem contrato) e contra o Relatório da
 * diretoria e a semana congelada. Só leitura.
 */
export default async function GrrConferenciaPage({ searchParams }: { searchParams: { semana?: string } }) {
  const usuario = await exigirPerfil(["gestor", "direcao"]);
  const hoje = hojeSantarem();
  const semana = resolverSemana(searchParams.semana ?? "ultima", hoje);
  const cadastro = await carregarCadastroGrr(mesDeReferencia(semana).de);
  const escopo = resolverEscopo({ perfil: "direcao", pop_id: null }, null, {}, cadastro);
  const dados = await carregarGrrComercial(semana, escopo, cadastro);
  const extras = await extrasDaConferencia(semana, dados);
  const verificacoes = conferirSemana(dados, extras);
  const resumo = resumoConferencia(verificacoes);
  const impossiveis = new Set(agentesImpossiveis(dados.porAgente));

  return (
    <div>
      <CabecalhoPagina titulo="Conferência dos dados" descricao={`GRR Comercial · Empresa · semana de ${rotuloSemana(semana)} · números de agora`} />
      <AreasGrr ativa="conferencia" parametros="" gestor={usuario.perfil === "gestor"} />
      <div className="mb-4 sm:max-w-md">
        <SeletorSemana semana={{ rotulo: rotuloSemana(semana), tipo: semana.tipo, emAndamento: dados.trechos.emAndamento }} vizinhas={semanasVizinhas(semana, hoje)} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["erro", "atencao", "info", "ok"] as const).map((s) => {
          const Icone = ICONE[s];
          return (
            <div key={s} className="rounded-xl border bg-card p-3 shadow-sm">
              <p className={cn("flex items-center gap-1.5 text-xs font-medium", COR[s])}>
                <Icone className="h-4 w-4" aria-hidden /> {ROTULO[s]}
              </p>
              <p className="text-2xl font-bold tabular-nums">{resumo[s]}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {GRUPOS.map((g) => (
          <section key={g.chave} className="rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby={`t-${g.chave}`}>
            <h2 id={`t-${g.chave}`} className="mb-2 text-base font-semibold">
              {g.titulo}
            </h2>
            <ul className="divide-y">
              {verificacoes
                .filter((v) => v.grupo === g.chave)
                .map((v) => {
                  const Icone = ICONE[v.status];
                  return (
                    <li key={v.chave} className="flex gap-3 py-2.5">
                      <Icone className={cn("mt-0.5 h-5 w-5 shrink-0", COR[v.status])} aria-label={ROTULO[v.status]} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium">{v.titulo}</p>
                          <p className="text-sm font-semibold tabular-nums">{v.valor}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{v.detalhe}</p>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="t-agentes">
        <h2 id="t-agentes" className="text-base font-semibold">
          Leads e conversão por agente
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">Leads recebidos e atendidos no trecho, convertidos por safra e pela conta do CRM. Linha marcada: número impossível.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm tabular-nums">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Agente</th>
                <th className="text-right font-medium">Leads recebidos</th>
                <th className="text-right font-medium">Atendidos</th>
                <th className="text-right font-medium">Safra: atendidos → venda</th>
                <th className="text-right font-medium">Conversão por safra</th>
                <th className="text-right font-medium">CRM: fechados → convertidos</th>
                <th className="text-right font-medium">Conversão do CRM</th>
                <th className="text-right font-medium">Vendas</th>
              </tr>
            </thead>
            <tbody>
              {dados.porAgente.map((l) => (
                <tr key={l.id} className={cn("border-b last:border-0", impossiveis.has(l.nome) && "bg-red-50 text-red-900")}>
                  <td className="py-2 font-medium">{l.nome}</td>
                  <td className="text-right">{l.recebidos}</td>
                  <td className="text-right">{l.atendidos}</td>
                  <td className="text-right">
                    {l.safraAtendidos} → {l.safraConvertidos}
                  </td>
                  <td className="text-right font-semibold">{pct(l.safraTaxa)}</td>
                  <td className="text-right">
                    {l.fechados} → {l.convertidos}
                  </td>
                  <td className="text-right">{pct(l.conversao)}</td>
                  <td className="text-right">{l.vendas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="mt-4 text-xs text-muted-foreground">
        As permissões por perfil são conferidas por um teste no banco (scripts/grr/conferir-permissoes.mjs), feito em transação desfeita no final: nada é gravado.
      </p>
    </div>
  );
}
