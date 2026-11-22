import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { PERFIS_OPERACAO } from "@/lib/operacao/regras";
import { gradeDoMes, mesVizinho, resolverMes, rotuloMes } from "@/lib/operacao/calendario";
import { dadosCalendario } from "@/lib/operacao/calendario-dados";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { AbasOperacao } from "../abas";
import { CalendarioOperacao } from "./calendario";

export const dynamic = "force-dynamic";

/**
 * Calendário da Operação Técnica (21/11/2026): por dia, o que está agendado e
 * o que foi concluído. Só leitura do SGP.
 */
export default async function CalendarioPage({ searchParams }: { searchParams: { mes?: string } }) {
  await exigirPerfil(PERFIS_OPERACAO);
  const agora = Date.now();
  const hoje = new Date(agora - 3 * 3_600_000).toISOString().slice(0, 10);
  const mes = resolverMes(searchParams.mes, hoje);
  const [{ itens, atualizadoEm }, linkTemplate] = await Promise.all([dadosCalendario(mes, agora), templateLinkSgp()]);
  return (
    <div>
      <CabecalhoPagina
        titulo="Operação Técnica"
        descricao="Agenda de instalações, mudanças de endereço e suporte: o que está agendado e o que foi concluído em cada dia, lido do SGP."
      />
      <AbasOperacao ativa="calendario" />
      <CalendarioOperacao
        mes={mes}
        rotulo={rotuloMes(mes)}
        anterior={mesVizinho(mes, -1)}
        proximo={mesVizinho(mes, 1)}
        semanas={gradeDoMes(mes).semanas}
        hoje={hoje}
        itens={itens}
        atualizadoEm={atualizadoEm}
        linkTemplate={linkTemplate}
      />
    </div>
  );
}
