import { ExternalLink } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { contagemStatus } from "@/lib/relatorio-semanal/placar";
import { hojeSantarem, rotuloSemana, somarDias, ultimaSemanaCompleta } from "@/lib/relatorio-semanal/periodo";
import type { ItemPlacar } from "@/lib/relatorio-semanal/tipos";
import { GerarRelatorio, ReescreverTextos } from "./painel";

export const dynamic = "force-dynamic";
// ler o banco e escrever os textos leva de 1 a 3 minutos
export const maxDuration = 300;

/**
 * Relatório da diretoria (04/11/2026): lista dos relatórios semanais e o
 * botão para gerar o de uma semana. O relatório abre fora do menu, no
 * visual do modelo aprovado pela diretoria.
 */
export default async function RelatoriosPage() {
  await exigirPerfil(["gestor", "direcao"]);
  const { data } = await criarClienteAdmin()
    .from("relatorios_semanais")
    .select("id, semana_inicio, semana_fim, gerado_em, textos_erro, placar:dados->placar")
    .order("semana_inicio", { ascending: false })
    .limit(30);
  const relatorios = (data ?? []) as { id: string; semana_inicio: string; semana_fim: string; gerado_em: string; textos_erro: string | null; placar: ItemPlacar[] | null }[];
  const ultima = ultimaSemanaCompleta(hojeSantarem());
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const inicio = somarDias(ultima.inicio, -7 * i);
    return { inicio, rotulo: rotuloSemana({ inicio, fim: somarDias(inicio, 6) }), existe: relatorios.some((r) => r.semana_inicio === inicio) };
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Relatório da diretoria"
        descricao="O Relatório Comercial Semanal no formato da diretoria: placar dos dez indicadores, vendas, esteira, base, retenção, insights e as perguntas da reunião de segunda. Os números saem do banco, com a mesma conta das telas; os textos são escritos pelo Claude a partir deles."
      />

      <section className="mb-6 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold">Gerar agora</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Escolha a semana (segunda a domingo). Gerar de novo uma semana atualiza os números e os textos e mantém o que já
          foi digitado na reunião.
        </p>
        <GerarRelatorio semanas={semanas} />
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <h2 className="border-b px-4 py-3 text-base font-semibold sm:px-5">Relatórios gerados</h2>
        {relatorios.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum relatório gerado ainda.</p>
        ) : (
          <ul className="divide-y">
            {relatorios.map((r) => {
              const c = r.placar ? contagemStatus(r.placar) : null;
              return (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <p className="font-medium">Semana de {rotuloSemana({ inicio: r.semana_inicio, fim: r.semana_fim })}</p>
                    <p className="text-xs text-muted-foreground">
                      Gerado em {new Date(r.gerado_em).toLocaleString("pt-BR", { timeZone: "America/Santarem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {c && ` · ${c.critico} críticos, ${c.atencao} em atenção, ${c.ok} ok${c.sem_meta ? `, ${c.sem_meta} sem meta` : ""}`}
                    </p>
                    {r.textos_erro && <p className="text-xs text-farol-vermelho">Textos não escritos: {r.textos_erro}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.textos_erro && <ReescreverTextos id={r.id} />}
                    <a
                      href={`/relatorios/semanal/${r.id}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-interlig-azul px-3 text-sm font-semibold text-white hover:bg-interlig-azul/90"
                    >
                      Abrir relatório <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
