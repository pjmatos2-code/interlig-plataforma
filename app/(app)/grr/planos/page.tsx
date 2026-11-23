import Link from "next/link";
import { exigirModulo } from "@/lib/acessos-dados";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { AreasGrr } from "@/components/grr/areas";
import { FormAprovacaoPlano, FormPlano } from "@/components/grr/planos/formularios";
import { SeloAprovacao, SeloSituacao } from "@/components/grr/planos/selos";
import { BotoesAprovacao } from "@/components/grr/reunioes/formularios";
import { exigirPerfil } from "@/lib/auth";
import { INDICADORES_GRR, indicadorPorChave } from "@/lib/grr/catalogo";
import { carregarCadastroGrr } from "@/lib/grr/dados";
import { contarPlanos, ehDiretoria, situacaoExibida, ROTULO_SITUACAO_PLANO, type SituacaoPlano } from "@/lib/grr/planos";
import { compromissosAguardando, listarPlanos, responsaveisPossiveis } from "@/lib/grr/planos-dados";
import { recortesDePlano, valorDoRecorte } from "@/lib/grr/recortes";
import { semanaAtual } from "@/lib/grr/semana";
import { dataBr, hojeSantarem, mesDeReferencia } from "@/lib/relatorio-semanal/periodo";
import { cn } from "@/lib/utils";
import { PERFIS_GRR } from "../carregar";

export const dynamic = "force-dynamic";

const FILTROS: { chave: SituacaoPlano | "atrasada" | "aprovacao" | "todos"; rotulo: string }[] = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "aprovacao", rotulo: "Aguardando a diretoria" },
  { chave: "pendente", rotulo: "Pendentes" },
  { chave: "em_andamento", rotulo: "Em andamento" },
  { chave: "aguardando_validacao", rotulo: "Aguardando validação" },
  { chave: "atrasada", rotulo: "Atrasados" },
  { chave: "concluida", rotulo: "Concluídos" },
  { chave: "cancelada", rotulo: "Cancelados" },
];

/** Planos de ação do GRR (Etapa 3): fila da diretoria, situação de execução e proposta de plano */
export default async function GrrPlanosPage({ searchParams }: { searchParams: { filtro?: string } }) {
  const { usuario } = await exigirModulo("grr_comercial");
  const hoje = hojeSantarem();
  const semana = semanaAtual(hoje);
  const diretoria = ehDiretoria(usuario.perfil);
  const [{ disponivel, planos }, cadastro, responsaveis, compromissos] = await Promise.all([
    listarPlanos(),
    carregarCadastroGrr(mesDeReferencia(semana).de),
    responsaveisPossiveis(),
    compromissosAguardando().catch(() => []),
  ]);
  const contagem = contarPlanos(planos, hoje);
  const filtro = FILTROS.some((f) => f.chave === searchParams.filtro) ? searchParams.filtro! : "todos";
  const visiveis = planos.filter((p) =>
    filtro === "todos" ? p.aprovacao !== "rejeitado" : filtro === "aprovacao" ? p.aprovacao === "aguardando" : p.aprovacao !== "rejeitado" && situacaoExibida(p, hoje) === filtro
  );
  const aguardando = planos.filter((p) => p.aprovacao === "aguardando");
  const recortes = recortesDePlano(usuario, cadastro).map((r) => ({ valor: valorDoRecorte(r), rotulo: r.rotulo }));
  const contadores: [string, number, string][] = [
    ["Pendentes", contagem.pendente, "pendente"],
    ["Em andamento", contagem.em_andamento, "em_andamento"],
    ["Aguardando validação", contagem.aguardando_validacao, "aguardando_validacao"],
    ["Atrasados", contagem.atrasada, "atrasada"],
    ["Concluídos", contagem.concluida, "concluida"],
    ["Aguardando a diretoria", contagem.aguardandoAprovacao, "aprovacao"],
  ];

  return (
    <div>
      <CabecalhoPagina titulo="Planos de ação" descricao="Ações por indicador ou problema, com responsável, prazo, evidências e aprovação da diretoria." />
      <AreasGrr ativa="acoes" parametros="" gestor={usuario.perfil === "gestor"} />
      {!disponivel ? (
        <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">Entra em funcionamento quando as tabelas da Etapa 3 forem criadas no banco (migração 0136).</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {contadores.map(([rotulo, n, chave]) => (
              <Link
                key={chave}
                href={`/grr/planos?filtro=${chave}`}
                className={cn("rounded-xl border bg-card p-3 shadow-sm hover:border-interlig-ceu", filtro === chave && "border-interlig-azul ring-1 ring-interlig-azul")}
              >
                <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
                <p className={cn("text-2xl font-bold tabular-nums", chave === "atrasada" && n > 0 && "text-red-700")}>{n}</p>
              </Link>
            ))}
          </div>

          {diretoria && (aguardando.length > 0 || compromissos.length > 0) && (
            <section className="rounded-2xl border border-farol-amarelo/40 bg-farol-amarelo/[0.06] p-4" aria-labelledby="t-fila">
              <h2 id="t-fila" className="text-base font-semibold">
                Aguardando a sua decisão ({aguardando.length + compromissos.length})
              </h2>
              <ul className="mt-3 space-y-3">
                {aguardando.map((p) => (
                  <li key={p.id} className="rounded-xl border bg-card p-3">
                    <Link href={`/grr/planos/${p.id}`} className="font-medium hover:underline">
                      {p.descricao}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {p.escopo_rotulo} · {p.indicador ? indicadorPorChave(p.indicador)?.nome : p.problema} · {p.responsavel_nome} · {p.prazo ? `até ${dataBr(p.prazo)}` : "sem prazo"}
                    </p>
                    <div className="mt-2">
                      <FormAprovacaoPlano id={p.id} compacto />
                    </div>
                  </li>
                ))}
                {compromissos.map((c) => (
                  <li key={c.id} className="rounded-xl border bg-card p-3">
                    <p className="font-medium">{c.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      Compromisso gerencial da reunião de equipe{c.reuniao ? ` (${c.reuniao.escopo_rotulo}, ${dataBr(c.reuniao.data_reuniao)})` : ""} · {c.responsavel_nome ?? "Equipe"}
                      {c.prazo ? ` · até ${dataBr(c.prazo)}` : ""}
                    </p>
                    <div className="mt-2">
                      <BotoesAprovacao id={c.reuniao_id} compromisso={c.id} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="t-lista">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="t-lista" className="text-base font-semibold">
                {FILTROS.find((f) => f.chave === filtro)?.rotulo} ({visiveis.length})
              </h2>
              {filtro !== "todos" && (
                <Link href="/grr/planos" className="text-sm text-interlig-azul hover:underline">
                  Ver todos
                </Link>
              )}
            </div>
            {visiveis.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">Nenhum plano aqui.</p>
            ) : (
              <ul className="divide-y rounded-2xl border bg-card shadow-sm">
                {visiveis.map((p) => (
                  <li key={p.id}>
                    <Link href={`/grr/planos/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/40">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{p.descricao}</span>
                        <span className="block text-xs text-muted-foreground">
                          {p.escopo_rotulo} · {p.indicador ? indicadorPorChave(p.indicador)?.nome ?? p.indicador : p.problema} · {p.responsavel_nome} · {p.prazo ? `até ${dataBr(p.prazo)}` : "sem prazo"}
                        </span>
                      </span>
                      <SeloAprovacao a={p.aprovacao} />
                      <SeloSituacao s={situacaoExibida(p, hoje)} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {recortes.length > 0 && (
            <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="t-novo">
              <h2 id="t-novo" className="text-base font-semibold">
                Propor plano de ação
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">Também dá para propor direto do indicador, na tela de detalhe, junto com o diagnóstico. O plano nasce aguardando a diretoria.</p>
              <FormPlano contexto={{ semana: semana.inicio }} recortes={recortes} indicadores={INDICADORES_GRR.map((i) => ({ chave: i.chave, nome: i.nome }))} responsaveis={responsaveis} />
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            Situações: {Object.values(ROTULO_SITUACAO_PLANO).join(", ")}. Atrasado é calculado pelo prazo. Validar e concluir é da diretoria. Avisos de prazo, aprovação e validação chegam no sino.
          </p>
        </div>
      )}
    </div>
  );
}
