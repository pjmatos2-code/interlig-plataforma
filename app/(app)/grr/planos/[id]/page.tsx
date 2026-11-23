import Link from "next/link";
import { exigirModulo } from "@/lib/acessos-dados";
import { notFound } from "next/navigation";
import { AreasGrr } from "@/components/grr/areas";
import { FormAprovacaoPlano, FormReenviarPlano, FormRegistroPlano, SeletorSituacaoPlano } from "@/components/grr/planos/formularios";
import { SeloAprovacao, SeloSituacao } from "@/components/grr/planos/selos";
import { exigirPerfil } from "@/lib/auth";
import { indicadorPorChave } from "@/lib/grr/catalogo";
import { ehDiretoria, ROTULO_APROVACAO_PLANO, ROTULO_SITUACAO_PLANO, situacaoExibida, situacoesPermitidas, type EventoPlano } from "@/lib/grr/planos";
import { lerPlano, nomesDeUsuarios } from "@/lib/grr/planos-dados";
import { dataBr, hojeSantarem, rotuloSemana, somarDias } from "@/lib/relatorio-semanal/periodo";
import { PERFIS_GRR } from "../../carregar";

export const dynamic = "force-dynamic";

const dataHora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} às ${d.slice(11, 16)}`;
};
const nomeCampo: Record<string, string> = { descricao: "ação", resultado_esperado: "resultado esperado", responsavel: "responsável", prazo: "prazo" };

function descreverEvento(e: EventoPlano): string {
  const d = (e.dados ?? {}) as Record<string, unknown>;
  if (e.tipo === "criada") return "Plano proposto";
  if (e.tipo === "situacao") return `Situação: ${ROTULO_SITUACAO_PLANO[d.antes as keyof typeof ROTULO_SITUACAO_PLANO] ?? d.antes} → ${ROTULO_SITUACAO_PLANO[d.depois as keyof typeof ROTULO_SITUACAO_PLANO] ?? d.depois}`;
  if (e.tipo === "aprovacao") return `Aprovação: ${ROTULO_APROVACAO_PLANO[d.depois as keyof typeof ROTULO_APROVACAO_PLANO] ?? d.depois}${e.texto ? `. Justificativa: ${e.texto}` : ""}`;
  if (e.tipo === "edicao")
    return `Alterado: ${Object.entries(d)
      .map(([k, v]) => {
        const [antes, depois] = (v as [unknown, unknown]) ?? [];
        return `${nomeCampo[k] ?? k} (${antes ?? "—"} → ${depois ?? "—"})`;
      })
      .join("; ")}`;
  return `${e.tipo === "evidencia" ? "Evidência" : "Comentário"}: ${e.texto ?? ""}`;
}

/** um plano de ação: dados, aprovação, situação, evidências e histórico */
export default async function GrrPlanoPage({ params }: { params: { id: string } }) {
  const { usuario } = await exigirModulo("grr_comercial");
  const lido = await lerPlano(params.id);
  if (!lido) notFound();
  const { plano: p, eventos, diagnostico } = lido;
  const hoje = hojeSantarem();
  const nomes = await nomesDeUsuarios([p.criado_por, p.aprovacao_por, ...eventos.map((e) => e.criado_por), diagnostico?.criado_por ?? null]);
  const diretoria = ehDiretoria(usuario.perfil);
  const indicador = p.indicador ? indicadorPorChave(p.indicador) : null;

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/grr/planos" className="text-interlig-azul hover:underline">
          ← Planos de ação
        </Link>
      </p>
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeloAprovacao a={p.aprovacao} />
          <SeloSituacao s={situacaoExibida(p, hoje)} />
        </div>
        <h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{p.descricao}</h1>
        <p className="text-sm text-muted-foreground">
          {p.escopo_rotulo} · {indicador ? indicador.nome : p.problema} · semana de {rotuloSemana({ inicio: p.periodo_inicio, fim: somarDias(p.periodo_inicio, 6) })}
        </p>
      </header>
      <AreasGrr ativa="acoes" parametros="" gestor={usuario.perfil === "gestor"} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Resultado esperado</dt>
                <dd className="font-medium">{p.resultado_esperado || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Responsável principal</dt>
                <dd className="font-medium">{p.responsavel_nome}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Prazo</dt>
                <dd className="font-medium">{p.prazo ? dataBr(p.prazo) : "sem prazo"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Proposto por</dt>
                <dd className="font-medium">
                  {(p.criado_por && nomes.get(p.criado_por)) || "—"} em {dataHora(p.criado_em)}
                </dd>
              </div>
              {p.aprovacao_em && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Decisão da diretoria</dt>
                  <dd className="font-medium">
                    {ROTULO_APROVACAO_PLANO[p.aprovacao]} por {(p.aprovacao_por && nomes.get(p.aprovacao_por)) || "—"} em {dataHora(p.aprovacao_em)}
                    {p.aprovacao_justificativa ? `: ${p.aprovacao_justificativa}` : ""}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {diretoria && p.aprovacao === "aguardando" && (
            <section className="rounded-2xl border border-farol-amarelo/40 bg-farol-amarelo/[0.06] p-4">
              <h2 className="mb-2 text-base font-semibold">Decisão da diretoria</h2>
              <FormAprovacaoPlano id={p.id} />
            </section>
          )}

          {p.aprovacao === "ajuste" && (
            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">Ajustar e reenviar</h2>
              <FormReenviarPlano id={p.id} descricao={p.descricao} resultado={p.resultado_esperado ?? ""} prazo={p.prazo ?? ""} />
            </section>
          )}

          {p.aprovacao !== "rejeitado" && (
            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">Situação</h2>
              <SeletorSituacaoPlano id={p.id} atual={p.situacao} permitidas={situacoesPermitidas(usuario.perfil, p)} />
              <p className="mt-2 text-xs text-muted-foreground">A coordenação leva o plano até “aguardando validação”; validar e concluir é da diretoria.</p>
            </section>
          )}

          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">Registrar evidência ou comentário</h2>
            <FormRegistroPlano id={p.id} />
          </section>
        </div>

        <div className="space-y-4">
          {diagnostico && (
            <section className="rounded-2xl border bg-card p-4 shadow-sm text-sm">
              <h2 className="mb-2 text-base font-semibold">Diagnóstico de origem</h2>
              <p className="text-xs text-muted-foreground">
                Versão {diagnostico.versao}, por {(diagnostico.criado_por && nomes.get(diagnostico.criado_por)) || "—"} em {dataHora(diagnostico.criado_em)}
                {diagnostico.valor ? ` · indicador em ${diagnostico.valor}${diagnostico.meta ? ` (${diagnostico.meta})` : ""}` : ""}
              </p>
              <p className="mt-2"><b>Causa:</b> {diagnostico.causa}</p>
              {diagnostico.evidencias && <p className="mt-1"><b>Evidências:</b> {diagnostico.evidencias}</p>}
              {diagnostico.solucao && <p className="mt-1"><b>Solução proposta:</b> {diagnostico.solucao}</p>}
            </section>
          )}
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">Histórico</h2>
            <ol className="space-y-2 text-sm">
              {eventos.map((e) => (
                <li key={e.id} className="border-l-2 border-interlig-ceu/40 pl-3">
                  <p>{descreverEvento(e)}</p>
                  <p className="text-xs text-muted-foreground">
                    {dataHora(e.criado_em)}
                    {e.criado_por && nomes.get(e.criado_por) ? ` · ${nomes.get(e.criado_por)}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
