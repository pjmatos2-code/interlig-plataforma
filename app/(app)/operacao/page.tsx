import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { dadosOperacao } from "@/lib/operacao/dados";
import { DIAS_QUADRO, PERFIS_OPERACAO } from "@/lib/operacao/regras";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { QuadroOperacao } from "./quadro";

export const dynamic = "force-dynamic";

/**
 * Operação Técnica — Fase 1 (21/11/2026): quadro das ocorrências de campo dos
 * últimos 30 dias, lido do SGP. Só leitura: a plataforma sugere e mostra; o
 * agendamento, a execução e o fechamento continuam no SGP.
 */
export default async function OperacaoPage() {
  await exigirPerfil(PERFIS_OPERACAO);
  const [dados, linkTemplate] = await Promise.all([dadosOperacao(), templateLinkSgp()]);
  return (
    <div>
      <CabecalhoPagina
        titulo="Operação Técnica"
        descricao={`Ocorrências de instalação, mudança de endereço e suporte abertas nos últimos ${DIAS_QUADRO} dias, lidas do SGP. Agendar, executar e fechar continuam no SGP.`}
      />
      <QuadroOperacao dados={dados} linkTemplate={linkTemplate} agora={Date.now()} />
    </div>
  );
}
