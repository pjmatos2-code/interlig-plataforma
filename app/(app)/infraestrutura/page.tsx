import { exigirModulo } from "@/lib/acessos-dados";
import { dadosOperacao } from "@/lib/operacao/dados";
import { DIAS_QUADRO } from "@/lib/operacao/regras";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { QuadroOperacao } from "../operacao/quadro";
import { AbasInfraestrutura } from "./abas";

export const dynamic = "force-dynamic";

/**
 * Infraestrutura (23/11/2026): as ocorrências da infraestrutura da rede, fora
 * da Operação Técnica — cliente interno "SETOR INFRAESTRUTURA", setor
 * Infraestrutura no SGP ou tipo "Infraestrutura - ...". Só leitura do SGP.
 */
export default async function InfraestruturaPage() {
  const { unidade } = await exigirModulo("infraestrutura");
  const [todos, linkTemplate] = await Promise.all([dadosOperacao(Date.now(), "infraestrutura"), templateLinkSgp()]);
  const dados = unidade ? { ...todos, cartoes: todos.cartoes.filter((c) => c.unidade === unidade), historico: todos.historico.filter((c) => c.unidade === unidade) } : todos;
  return (
    <QuadroOperacao
      dados={dados}
      linkTemplate={linkTemplate}
      agora={Date.now()}
      unidadeFixa={unidade}
      setor="infraestrutura"
      titulo="Infraestrutura"
      descricao={`Ocorrências da infraestrutura da rede (CTO, rompimento, sinal, sem acesso em massa) abertas nos últimos ${DIAS_QUADRO} dias, lidas do SGP. Agendar, executar e fechar continuam no SGP.`}
      abas={<AbasInfraestrutura ativa="quadro" />}
    />
  );
}
