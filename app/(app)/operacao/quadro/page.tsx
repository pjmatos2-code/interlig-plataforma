import { exigirModulo } from "@/lib/acessos-dados";
import { ConteudoOperacao } from "../conteudo";

export const dynamic = "force-dynamic";

/** Operação Técnica, Quadro de Ocorrências: o mesmo quadro da Visão Geral, sem os gráficos e com mais altura. Só leitura do SGP. */
export default async function QuadroPage() {
  const { unidade } = await exigirModulo("operacao");
  return <ConteudoOperacao unidade={unidade} visao="quadro" />;
}
