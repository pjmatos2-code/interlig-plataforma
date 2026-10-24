import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { VERSAO_REGRAS } from "./config";
import { calcularLinha, indexar, ordenarRanking, type LinhaPerformance } from "./dados/calcular";
import { carregarBase } from "./dados/carregar";
import { resolverPeriodoPerf } from "./periodo";
import { ESCOPO_SISTEMA } from "./sistema";

/**
 * Fotografias diárias (24/10/2026): o que cada vendedor tinha no dia, na
 * semana e no mês até o dia — com a versão das regras. As telas recalculam
 * do dado bruto; a fotografia guarda "o que valia naquele dia" (auditoria e
 * histórico mesmo depois de mudar pesos ou regras). Idempotente por dia.
 */
const somaDias = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

export async function gravarSnapshots(dia: string) {
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const periodo = resolverPeriodoPerf({ periodo: "personalizado", de: `${dia.slice(0, 7)}-01`, ate: dia }, hoje);
  const base = await carregarBase(ESCOPO_SISTEMA, periodo);
  const idx = indexar(base);
  const avaliados = base.vendedores.filter((v) => base.cfg.setores.includes(v.setor ?? ""));
  const temAtividade = (l: LinhaPerformance) =>
    l.vendedor.ativo || l.numeros.vendas > 0 || l.numeros.leadsRecebidos > 0 || l.numeros.conversasAtivas > 0 || l.numeros.leadsTrabalhados > 0;
  const janelas: ["dia" | "semana" | "mes", string][] = [
    ["dia", dia],
    ["semana", somaDias(dia, -6)],
    ["mes", `${dia.slice(0, 7)}-01`],
  ];
  const linhas = janelas.flatMap(([janela, de]) =>
    ordenarRanking(avaliados.map((v) => calcularLinha(base, idx, v, de, dia)))
      .filter(temAtividade)
      .map((l) => ({
        data_referencia: dia,
        janela,
        vendedor_id: l.vendedor.id,
        setor: l.vendedor.setor,
        pop_id: l.vendedor.pop_id,
        metricas: {
          ...l.numeros,
          indicadores: Object.fromEntries(
            [...Object.values(l.esforco.indicadores), ...Object.values(l.resultado.indicadores), ...Object.values(l.qualidade.indicadores)].map((i) => [
              i.chave,
              { valor: i.valor, nota: i.nota, disponivel: i.disponivel, motivo: i.motivo ?? null },
            ])
          ),
        },
        scores: {
          esforco: l.esforco.score.valor,
          resultado: l.resultado.score.valor,
          qualidade: l.qualidade.score.valor,
          cobertura_esforco: l.esforco.score.cobertura,
          comparavel: l.flags.comparavel,
          motivo_nao_comparavel: l.flags.motivoNaoComparavel,
          disponibilidade: l.flags.disponibilidade,
        },
        ipc: l.ipc.valor,
        provisorio: l.ipc.provisorio,
        posicao: l.posicao,
        versao_regras: VERSAO_REGRAS,
      }))
  );
  const admin = criarClienteAdmin();
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await admin.from("performance_snapshots").upsert(linhas.slice(i, i + 200), { onConflict: "data_referencia,janela,vendedor_id" });
    if (error) throw new Error(`fotografias ${dia}: ${error.message}`);
  }
  return { dia, linhas: linhas.length };
}
