import { exigirModulo } from "@/lib/acessos-dados";
import { ConteudoOperacao } from "./conteudo";

export const dynamic = "force-dynamic";

/** Operação Técnica, Visão Geral (redesign, 25/11/2026): indicadores, gráficos e o quadro das ocorrências de campo. Só leitura do SGP. */
export default async function OperacaoPage() {
  const { unidade } = await exigirModulo("operacao");
  return <ConteudoOperacao unidade={unidade} visao="geral" />;
}
