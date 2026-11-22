import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { PERFIS_OPERACAO } from "@/lib/operacao/regras";
import { listarDeixados } from "@/lib/operacao/deixados-dados";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { AbasOperacao } from "../abas";
import { ListaDeixados } from "./lista";

export const dynamic = "force-dynamic";

/**
 * Clientes deixados para trás (21/11/2026): a lista nominal do indicador do
 * GRR Técnico, para cobrar um por um. Meta zero. Só leitura do SGP.
 */
export default async function DeixadosPage() {
  await exigirPerfil(PERFIS_OPERACAO);
  const agora = Date.now();
  const [{ lista, janela }, linkTemplate] = await Promise.all([listarDeixados(agora), templateLinkSgp()]);
  return (
    <div>
      <CabecalhoPagina
        titulo="Operação Técnica"
        descricao="Clientes com OS de instalação criada nas 8 semanas anteriores que ainda não viraram contrato ativo. Meta zero: ninguém pode ficar para trás."
      />
      <AbasOperacao ativa="deixados" />
      <ListaDeixados lista={lista} janela={janela} linkTemplate={linkTemplate} agora={agora} />
    </div>
  );
}
