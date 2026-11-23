import { exigirModulo } from "@/lib/acessos-dados";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { gradeDoMes, mesVizinho, resolverMes, rotuloMes } from "@/lib/operacao/calendario";
import { dadosCalendario } from "@/lib/operacao/calendario-dados";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { CalendarioOperacao } from "../../operacao/calendario/calendario";
import { AbasInfraestrutura } from "../abas";

export const dynamic = "force-dynamic";

/** Calendário da Infraestrutura: por dia, o que está agendado e o que foi concluído. Só leitura do SGP. */
export default async function CalendarioInfraestruturaPage({ searchParams }: { searchParams: { mes?: string } }) {
  const { unidade } = await exigirModulo("infraestrutura");
  const agora = Date.now();
  const hoje = new Date(agora - 3 * 3_600_000).toISOString().slice(0, 10);
  const mes = resolverMes(searchParams.mes, hoje);
  const [{ itens: todos, atualizadoEm }, linkTemplate] = await Promise.all([dadosCalendario(mes, agora, "infraestrutura"), templateLinkSgp()]);
  const itens = unidade ? todos.filter((o) => o.unidade === unidade) : todos;
  return (
    <div>
      <CabecalhoPagina titulo="Infraestrutura" descricao="Agenda da infraestrutura da rede: o que está agendado e o que foi concluído em cada dia, lido do SGP." />
      <AbasInfraestrutura ativa="calendario" />
      <CalendarioOperacao
        setor="infraestrutura"
        base="/infraestrutura/calendario"
        unidadeFixa={unidade}
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
