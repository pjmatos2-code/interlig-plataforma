import { exigirPerfil } from "@/lib/auth";
import { hojeIso, primeiroDiaDoMes } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { refidelizacaoDoMes } from "@/lib/refidelizacao/dados";
import { lerConfigSgp } from "@/lib/integracoes/config";
import { PainelRefidelizacao } from "./painel";

export const dynamic = "force-dynamic";

export default async function RefidelizacaoPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  await exigirPerfil(["gestor"]);
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "")
    ? `${searchParams.mes}-01`
    : primeiroDiaDoMes(hojeIso());
  const [dados, cfg] = await Promise.all([refidelizacaoDoMes(mes), lerConfigSgp()]);
  const baseSgp = cfg.base_url
    ? `${cfg.base_url.replace(/\/+$/, "").replace(/\/admin$/, "")}/admin`
    : null;

  return (
    <>
      <CabecalhoPagina
        titulo="Refidelização — Setor de Atendimento"
        descricao="Comissão por aditivo aprovado no SGP e com as duas assinaturas no SGPsign. Meta: 150 planos/mês por atendente (base: valor mensal, sem desconto)."
      />
      <PainelRefidelizacao dados={dados} baseSgp={baseSgp} />
    </>
  );
}
