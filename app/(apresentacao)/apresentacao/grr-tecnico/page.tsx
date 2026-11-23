import type { Metadata } from "next";
import { exigirModulo } from "@/lib/acessos-dados";
import { ApresentacaoTecnico } from "@/components/grr/apresentacao/tecnico";
import { carregarTelaTecnico } from "@/lib/grr/tecnico/tela";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Apresentação · GRR Técnico · Interlig" };

/**
 * Modo Apresentação do GRR Técnico (reunião operacional de terça). Mesma
 * semana e mesmos números da tela do setor (foto congelada quando existe).
 * Abrir a apresentação não grava nada.
 */
export default async function ApresentacaoGrrTecnicoPage({ searchParams }: { searchParams: { semana?: string; unidade?: string } }) {
  const { unidade: unidadeFixa } = await exigirModulo("grr_tecnico");
  const t = await carregarTelaTecnico({ semana: searchParams.semana, unidadeFixa });
  const status = t.foto ? "números do fechamento" : t.emAndamento ? "números de agora, semana em andamento" : "números calculados agora";
  const volta = searchParams.semana ? `/grr/tecnico?semana=${encodeURIComponent(searchParams.semana)}` : "/grr/tecnico";
  return <ApresentacaoTecnico rotuloSemana={t.rotuloDaSemana} status={status} hrefVoltar={volta} porRecorte={t.porRecorte} />;
}
