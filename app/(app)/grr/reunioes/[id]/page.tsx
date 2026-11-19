import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Presentation } from "lucide-react";
import { AreasGrr } from "@/components/grr/areas";
import { BotoesAprovacao, FormCompromisso, FormCorrecao, FormEncerrar, FormPreparacao, SeletorSituacao } from "@/components/grr/reunioes/formularios";
import { TabelaEquipe } from "@/components/grr/reunioes/tabela-equipe";
import { PaginaReuniaoDiretoria } from "@/components/grr/reunioes/pagina-diretoria";
import { exigirPerfil } from "@/lib/auth";
import { compromissosParaConferir, participantesSugeridos, podeConduzir, resumoCompromissos, ROTULO_APROVACAO, ROTULO_SITUACAO, type Compromisso } from "@/lib/grr/reunioes";
import { indicadoresDaReuniao, lerReuniao, type FotoDaReuniao } from "@/lib/grr/reunioes-dados";
import { dataBr, hojeSantarem, rotuloSemana } from "@/lib/relatorio-semanal/periodo";
import { cn } from "@/lib/utils";
import { PERFIS_GRR } from "../../carregar";

export const dynamic = "force-dynamic";

const dataHora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} às ${d.slice(11, 16)}`;
};

function Bloco({ titulo, children, sub }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-label={titulo}>
      <h2 className="text-base font-semibold tracking-tight">{titulo}</h2>
      {sub && <p className="mb-3 text-xs text-muted-foreground">{sub}</p>}
      <div className={sub ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function LinhaCompromisso({ c, reuniaoId, podeEditar, diretoria, hoje }: { c: Compromisso; reuniaoId: string; podeEditar: boolean; diretoria: boolean; hoje: string }) {
  const atrasado = (c.situacao === "pendente" || c.situacao === "em_andamento") && !!c.prazo && c.prazo < hoje;
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{c.descricao}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {c.responsavel_nome ?? "Equipe"} · {c.prazo ? `até ${dataBr(c.prazo)}` : "sem prazo"}
          {atrasado && <span className="font-semibold text-red-700"> · atrasado</span>}
          {c.tipo === "gerencial" && <> · gerencial: {ROTULO_APROVACAO[c.aprovacao]}</>}
        </p>
        {c.tipo === "gerencial" && c.aprovacao === "aguardando" && diretoria && (
          <div className="mt-2">
            <BotoesAprovacao id={reuniaoId} compromisso={c.id} />
          </div>
        )}
      </div>
      {podeEditar ? (
        <SeletorSituacao id={reuniaoId} compromisso={c.id} situacao={c.situacao} podeEditar={podeEditar} />
      ) : (
        <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{ROTULO_SITUACAO[c.situacao]}</span>
      )}
    </li>
  );
}

/** Reunião Semanal da Equipe Comercial: preparação, indicadores, compromissos e encerramento */
export default async function GrrReuniaoPage({ params }: { params: { id: string } }) {
  const usuario = await exigirPerfil([...PERFIS_GRR]);
  const completa = await lerReuniao(params.id);
  if (!completa) notFound();
  const { reuniao: r, compromissos, anterior, daAnterior, registros } = completa;
  if (r.modalidade === "diretoria") return <PaginaReuniaoDiretoria r={r} registros={registros} usuario={usuario} />;
  const hoje = hojeSantarem();
  const { dados, congelados, cadastro } = await indicadoresDaReuniao(r, usuario.id);
  const pode = podeConduzir(usuario, r, cadastro);
  const aberta = r.situacao === "aberta";
  const diretoria = usuario.perfil === "gestor" || usuario.perfil === "direcao";
  const sugeridos = participantesSugeridos(r, cadastro);
  const foto = (r.dados as FotoDaReuniao | null) ?? null;
  const agentes = dados.porAgente.filter((l) => sugeridos.some((p) => p.id === l.id && p.papel === "agente"));
  const conferir = compromissosParaConferir(aberta ? daAnterior : foto?.conferidos ?? daAnterior);
  const resumo = resumoCompromissos(conferir, hoje);

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/grr/reunioes" className="text-interlig-azul hover:underline">
          ← Reuniões
        </Link>
      </p>
      <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Reunião da equipe · {r.escopo_rotulo}</h1>
          <p className="text-sm text-muted-foreground">
            {dataBr(r.data_reuniao)} · período {rotuloSemana({ inicio: r.periodo_inicio, fim: r.periodo_fim })} · conduzida por {r.responsavel_nome ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium", aberta ? "border-interlig-ceu/40 bg-interlig-ceu/10 text-interlig-azul" : "bg-muted text-muted-foreground")}>
            {!aberta && <Lock className="h-3.5 w-3.5" aria-hidden />}
            {aberta ? "Aberta" : `Encerrada em ${dataHora(r.encerrada_em!)}`}
          </span>
          <Link href={`/apresentacao/grr/reuniao/${r.id}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-interlig-azul px-4 text-sm font-semibold text-white hover:bg-interlig-azul/90">
            <Presentation className="h-4 w-4" aria-hidden /> Apresentar reunião
          </Link>
        </div>
      </header>
      <AreasGrr ativa="reunioes" parametros="" gestor={usuario.perfil === "gestor"} />

      <div className="space-y-4">
        <Bloco
          titulo="Indicadores da equipe por agente"
          sub={congelados ? `Números guardados no encerramento (${dataHora(r.corte_em ?? r.encerrada_em!)}).` : `Números de agora${dados.trechos.emAndamento ? ", semana em andamento" : ""}. Ficam guardados ao encerrar.`}
        >
          {agentes.length ? <TabelaEquipe linhas={agentes} /> : <p className="text-sm text-muted-foreground">Nenhum agente no recorte.</p>}
          <p className="mt-2 text-xs text-muted-foreground">Equipe na semana: {dados.vendas.semana} vendas{dados.vendas.metaSemana != null ? ` (meta ${Math.round(dados.vendas.metaSemana)})` : ""} · conversão por safra {dados.conversao.safra.taxa == null ? "—" : `${Math.round(dados.conversao.safra.taxa * 100)}%`} · {dados.perdas.retornosVencidos} follow-ups vencidos.</p>
        </Bloco>

        <div className="grid gap-4 xl:grid-cols-2">
          <Bloco titulo="Compromissos da reunião anterior" sub={anterior ? `Reunião de ${dataBr(anterior.data_reuniao)}: ${resumo.concluidos} concluídos, ${resumo.emAberto} em aberto${resumo.atrasados ? ` (${resumo.atrasados} atrasados)` : ""}, ${resumo.naoFeitos} não feitos.` : undefined}>
            {!anterior ? (
              <p className="text-sm text-muted-foreground">Primeira reunião desta equipe: não há compromissos anteriores.</p>
            ) : conferir.length === 0 ? (
              <p className="text-sm text-muted-foreground">A reunião anterior não deixou compromissos.</p>
            ) : (
              <ul className="divide-y">
                {conferir.map((c) => (
                  <LinhaCompromisso key={c.id} c={c} reuniaoId={r.id} podeEditar={pode && aberta} diretoria={diretoria} hoje={hoje} />
                ))}
              </ul>
            )}
          </Bloco>

          <Bloco titulo="Compromissos desta reunião" sub="Operacionais ficam com a coordenação; gerenciais aguardam a diretoria.">
            {compromissos.length > 0 && (
              <ul className="mb-3 divide-y">
                {compromissos.map((c) => (
                  <LinhaCompromisso key={c.id} c={c} reuniaoId={r.id} podeEditar={pode} diretoria={diretoria} hoje={hoje} />
                ))}
              </ul>
            )}
            {pode && aberta ? (
              <FormCompromisso id={r.id} agentes={sugeridos.filter((p) => p.papel === "agente")} />
            ) : (
              compromissos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum compromisso registrado.</p>
            )}
          </Bloco>
        </div>

        <Bloco titulo="Participantes, observações e boas práticas">
          <FormPreparacao
            id={r.id}
            data={r.data_reuniao}
            sugeridos={sugeridos}
            participantes={r.participantes}
            observacoes={r.observacoes ?? ""}
            boasPraticas={r.boas_praticas ?? ""}
            podeEditar={pode && aberta}
          />
        </Bloco>

        <Bloco titulo={aberta ? "Encerramento" : "Correções"}>
          {aberta ? (
            pode ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Ao encerrar, os indicadores, as metas e os comparativos, os participantes, as observações e os compromissos ficam guardados como estão. Depois disso, só correções registradas à parte.</p>
                <FormEncerrar id={r.id} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Quem encerra é a coordenação desta equipe, a administração ou a direção.</p>
            )
          ) : (
            <div className="space-y-3">
              {registros.filter((x) => x.tipo === "correcao").length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma correção registrada.</p>
              ) : (
                <ul className="space-y-2">
                  {registros
                    .filter((x) => x.tipo === "correcao")
                    .map((x) => (
                      <li key={x.id} className="rounded-lg border bg-background px-3 py-2 text-sm">
                        <p>{x.texto}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{dataHora(x.criado_em)}</p>
                      </li>
                    ))}
                </ul>
              )}
              {pode && <FormCorrecao id={r.id} />}
            </div>
          )}
        </Bloco>
      </div>
    </div>
  );
}
