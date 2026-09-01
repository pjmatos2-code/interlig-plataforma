import { exigirPerfil } from "@/lib/auth";
import { hojeIso, primeiroDiaDoMes } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { tecnicaDoMes } from "@/lib/tecnica/dados";
import { lerConfigSgp } from "@/lib/integracoes/config";
import { PainelTecnica } from "./painel";

export const dynamic = "force-dynamic";

export default async function TecnicaPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "financeiro", "gestor_tecnico"]);
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "")
    ? `${searchParams.mes}-01`
    : primeiroDiaDoMes(hojeIso());
  const [dados, cfg] = await Promise.all([tecnicaDoMes(mes), lerConfigSgp()]);
  const baseSgp = cfg.base_url
    ? `${cfg.base_url.replace(/\/+$/, "").replace(/\/admin$/, "")}/admin`
    : null;

  return (
    <>
      <CabecalhoPagina
        titulo="Equipe Técnica — produtividade e comissão"
        descricao="Só OS ENCERRADA pontua. Ativação/mudança de endereço: ATM R$ 30 · BN e VTX R$ 15 · suporte R$ 10 (técnicos habilitados). Retorno em 72h anula a OS de origem."
      />
      <PainelTecnica dados={dados} baseSgp={baseSgp} ehGestor={usuario.perfil === "gestor" || usuario.perfil === "gestor_tecnico"} />
    </>
  );
}
