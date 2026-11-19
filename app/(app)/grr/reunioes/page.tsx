import Link from "next/link";
import { CalendarClock, FileText, Presentation, Users } from "lucide-react";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { AreasGrr } from "@/components/grr/areas";
import { FormNovaReuniao } from "@/components/grr/reunioes/formularios";
import { FormNovaReuniaoDiretoria } from "@/components/grr/reunioes/diretoria-forms";
import { exigirPerfil } from "@/lib/auth";
import { carregarCadastroGrr } from "@/lib/grr/dados";
import { recortesPermitidos } from "@/lib/grr/reunioes";
import { listarReunioes } from "@/lib/grr/reunioes-dados";
import { semanaAtual } from "@/lib/grr/semana";
import { dataBr, hojeSantarem, mesDeReferencia, rotuloSemana, ultimaSemanaCompleta } from "@/lib/relatorio-semanal/periodo";
import { cn } from "@/lib/utils";
import { PERFIS_GRR } from "../carregar";

export const dynamic = "force-dynamic";

/**
 * Reuniões do GRR: a de resultados da diretoria (segunda, pelo Relatório da
 * diretoria) e a Reunião Semanal da Equipe Comercial (coordenação com os
 * agentes, normalmente aos sábados). Cada perfil vê as reuniões do seu
 * recorte (permissão por linha do banco).
 */
export default async function GrrReunioesPage() {
  const usuario = await exigirPerfil([...PERFIS_GRR]);
  const hoje = hojeSantarem();
  const atual = semanaAtual(hoje);
  const ultima = ultimaSemanaCompleta(hoje);
  const [cadastro, { disponivel, reunioes }] = await Promise.all([carregarCadastroGrr(mesDeReferencia(atual).de), listarReunioes()]);
  const recortes = recortesPermitidos(usuario, cadastro).map((r) => ({ valor: `${r.tipo}:${r.ref}`, rotulo: r.rotulo }));
  const diretoria = usuario.perfil === "gestor" || usuario.perfil === "direcao";

  return (
    <div>
      <CabecalhoPagina titulo="Reuniões do GRR" descricao="Reunião de resultados da diretoria e reunião semanal da equipe comercial." />
      <AreasGrr ativa="reunioes" parametros="" gestor={usuario.perfil === "gestor"} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="t-diretoria">
          <h2 id="t-diretoria" className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="h-5 w-5 text-interlig-azul" aria-hidden /> Reunião de resultados da diretoria
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Diretoria com a coordenação, sobre a última semana completa ({rotuloSemana(ultima)}). Pauta: indicadores, diagnósticos, acompanhamento das ações, novas ações e decisões. Só a diretoria encerra.
          </p>
          {diretoria && disponivel && (
            <div className="mt-3">
              <FormNovaReuniaoDiretoria
                hoje={hoje}
                unidades={cadastro.pops}
                semanas={[
                  { valor: ultima.inicio, rotulo: `Última completa (${rotuloSemana(ultima)})` },
                  { valor: atual.inicio, rotulo: `Semana atual (${rotuloSemana(atual)})` },
                ]}
              />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/apresentacao/grr?semana=ultima" className="inline-flex h-10 items-center gap-2 rounded-lg bg-interlig-azul px-4 text-sm font-semibold text-white hover:bg-interlig-azul/90">
              <Presentation className="h-4 w-4" aria-hidden /> Apresentar a semana sem reunião
            </Link>
            {diretoria && (
              <Link href="/relatorios" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium hover:border-interlig-ceu">
                <FileText className="h-4 w-4" aria-hidden /> Relatório da diretoria
              </Link>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="t-equipe">
          <h2 id="t-equipe" className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-5 w-5 text-interlig-azul" aria-hidden /> Reunião semanal da equipe
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Coordenação com os agentes, normalmente aos sábados: números da equipe e de cada agente, compromissos da semana e conferência dos anteriores.</p>
          {!disponivel ? (
            <p className="mt-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Entra em funcionamento quando as tabelas de reuniões forem criadas no banco (migração 0135).</p>
          ) : recortes.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Seu perfil não coordena equipe nem unidade.</p>
          ) : (
            <div className="mt-3">
              <FormNovaReuniao
                recortes={recortes}
                hoje={hoje}
                semanas={[
                  { valor: atual.inicio, rotulo: `Semana atual (${rotuloSemana(atual)})` },
                  { valor: ultima.inicio, rotulo: `Última completa (${rotuloSemana(ultima)})` },
                ]}
              />
            </div>
          )}
        </section>
      </div>

      <section className="mt-6" aria-labelledby="t-lista">
        <h2 id="t-lista" className="mb-2 text-base font-semibold">
          Reuniões
        </h2>
        {!disponivel || reunioes.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">Nenhuma reunião registrada ainda.</p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card shadow-sm">
            {reunioes.map((r) => (
              <li key={r.id}>
                <Link href={`/grr/reunioes/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/40">
                  <span className="w-24 font-semibold tabular-nums">{dataBr(r.data_reuniao)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {r.modalidade === "diretoria" ? "Resultados" : "Equipe"} · {r.escopo_rotulo}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Período {rotuloSemana({ inicio: r.periodo_inicio, fim: r.periodo_fim })} · {r.responsavel_nome ?? "sem responsável"} · {r.participantes.length} participantes
                    </span>
                  </span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", r.situacao === "encerrada" ? "bg-muted text-muted-foreground" : "border-interlig-ceu/40 bg-interlig-ceu/10 text-interlig-azul")}>
                    {r.situacao === "encerrada" ? "Encerrada" : "Aberta"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
