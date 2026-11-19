import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { AreasGrr } from "@/components/grr/areas";
import { SeletorSemana } from "@/components/grr/painel/controles";
import { CartaoRotina } from "@/components/grr/rotinas";
import { exigirPerfil } from "@/lib/auth";
import { carregarRotinas } from "@/lib/grr/rotinas-dados";
import { resolverSemana, semanasAte, semanasVizinhas } from "@/lib/grr/semana";
import { hojeSantarem, rotuloSemanaCurto, rotuloSemana } from "@/lib/relatorio-semanal/periodo";
import { cn } from "@/lib/utils";
import { PERFIS_GRR } from "../carregar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rotinas das lideranças: o roteiro semanal da coordenação e da diretoria,
 * conferido com os dados da plataforma (ninguém marca nada). A coordenação
 * vê a própria rotina; a diretoria vê todas, com o histórico das semanas.
 */
export default async function GrrRotinasPage({ searchParams }: { searchParams: { semana?: string } }) {
  const usuario = await exigirPerfil([...PERFIS_GRR]);
  const hoje = hojeSantarem();
  const semana = resolverSemana(searchParams.semana, hoje);
  const semanas = semanasAte(semana, 6);
  const resultado = await carregarRotinas(semanas, usuario, semana);
  const daSemana = resultado.find((r) => r.semana.inicio === semana.inicio)!;
  const lideres = daSemana.lideres;

  return (
    <div>
      <CabecalhoPagina titulo="Rotinas das lideranças" descricao="O roteiro semanal da coordenação e da diretoria, conferido pela plataforma com os dados do CRM, do SGP e do GRR." />
      <AreasGrr ativa="rotinas" parametros="" gestor={usuario.perfil === "gestor"} />
      <div className="mb-4 sm:max-w-md">
        <SeletorSemana semana={{ rotulo: rotuloSemana(semana), tipo: semana.tipo, emAndamento: semana.fim >= hoje }} vizinhas={semanasVizinhas(semana, hoje)} />
      </div>

      {lideres.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">Seu perfil não coordena equipe.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {lideres.map((l) => (
            <CartaoRotina key={l.liderId} lider={l} />
          ))}
        </div>
      )}

      {lideres.length > 0 && (
        <section className="mt-6 rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="t-historico">
          <h2 id="t-historico" className="text-base font-semibold">
            Cumprimento nas últimas semanas
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">Itens cumpridos sobre os itens que dava para avaliar em cada semana.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm tabular-nums">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Líder</th>
                  {resultado.map((r) => (
                    <th key={r.semana.inicio} className={cn("text-right font-medium", r.semana.inicio === semana.inicio && "text-foreground")}>
                      {rotuloSemanaCurto(r.semana)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lideres.map((l) => (
                  <tr key={l.liderId} className="border-b last:border-0">
                    <td className="py-2 font-medium">{l.nome}</td>
                    {resultado.map((r) => {
                      const x = r.lideres.find((y) => y.liderId === l.liderId);
                      const taxa = x && x.avaliados ? x.cumpridos / x.avaliados : null;
                      return (
                        <td key={r.semana.inicio} className={cn("text-right", taxa == null ? "text-muted-foreground" : taxa === 1 ? "text-green-700" : taxa >= 0.5 ? "text-amber-600" : "text-red-700")}>
                          {x && x.avaliados ? `${x.cumpridos}/${x.avaliados}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Prazos no horário de Santarém. Follow-ups vencidos são medidos só na semana atual; diagnósticos de semanas antigas dependem da semana congelada da equipe.
      </p>
    </div>
  );
}
