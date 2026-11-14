import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { conferirAssinaturaPdf } from "@/lib/relatorio-semanal/assinatura";
import { checklistDaReuniao, relatorioAnterior, type LinhaRelatorio } from "@/lib/relatorio-semanal/gerar";
import type { TextosRelatorio } from "@/lib/relatorio-semanal/tipos";
import { RelatorioSemanal } from "@/components/relatorio-semanal/relatorio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** a fonte reserva do Chromium do servidor (Open Sans) não tem seta: troca por "para" */
function semSetas(t: TextosRelatorio | null): TextosRelatorio | null {
  if (!t) return t;
  return JSON.parse(JSON.stringify(t).replace(/\s*→\s*/g, " para ")) as TextosRelatorio;
}

/**
 * Página que o servidor imprime para o PDF do e-mail (lib/relatorio-semanal/
 * pdf.ts). Não usa sessão: só abre com o link assinado, que expira em
 * minutos. Mesmo conteúdo da tela, sem campos nem botões.
 */
export default async function PaginaImpressaoRelatorio({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { exp?: string | string[]; sig?: string | string[] };
}) {
  const exp = typeof searchParams.exp === "string" ? searchParams.exp : undefined;
  const sig = typeof searchParams.sig === "string" ? searchParams.sig : undefined;
  if (!/^[0-9a-f-]{36}$/.test(params.id) || !conferirAssinaturaPdf(params.id, exp, sig)) notFound();
  const { data } = await criarClienteAdmin()
    .from("relatorios_semanais")
    .select("id, semana_inicio, semana_fim, dados, textos, textos_erro, reuniao, token, gerado_em")
    .eq("id", params.id)
    .maybeSingle();
  const r = data as LinhaRelatorio | null;
  if (!r) notFound();
  const anterior = await relatorioAnterior({ inicio: r.semana_inicio, fim: r.semana_fim });
  const combinado = anterior ? checklistDaReuniao(anterior.reuniao) : [];
  return (
    <RelatorioSemanal
      id={r.id}
      dados={r.dados}
      textos={semSetas(r.textos)}
      reuniao={r.reuniao ?? {}}
      combinadoAnterior={combinado.length ? combinado : null}
      podeEditar={false}
      modo="pdf"
    />
  );
}
