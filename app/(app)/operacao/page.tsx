import { exigirModulo } from "@/lib/acessos-dados";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { dadosOperacao } from "@/lib/operacao/dados";
import { DIAS_QUADRO } from "@/lib/operacao/regras";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { QuadroOperacao } from "./quadro";
import { AbasOperacao } from "./abas";

export const dynamic = "force-dynamic";

/**
 * Operação Técnica — Fase 1 (21/11/2026): quadro das ocorrências de campo dos
 * últimos 30 dias, lido do SGP. Só leitura: a plataforma sugere e mostra; o
 * agendamento, a execução e o fechamento continuam no SGP.
 */
export default async function OperacaoPage() {
  const { unidade } = await exigirModulo("operacao");
  const [todos, linkTemplate] = await Promise.all([dadosOperacao(), templateLinkSgp()]);
  // quem fica preso a uma unidade vê só ela
  const dados = unidade ? { ...todos, cartoes: todos.cartoes.filter((c) => c.unidade === unidade) } : todos;
  return (
    <div>
      <CabecalhoPagina
        titulo="Operação Técnica"
        descricao={`Ocorrências de instalação, mudança de endereço e suporte abertas nos últimos ${DIAS_QUADRO} dias, lidas do SGP. Agendar, executar e fechar continuam no SGP.`}
      />
      <AbasOperacao ativa="quadro" />
      <QuadroOperacao dados={dados} linkTemplate={linkTemplate} agora={Date.now()} unidadeFixa={unidade} />
    </div>
  );
}
