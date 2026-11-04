import { notFound } from "next/navigation";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { checklistDaReuniao, relatorioAnterior, type LinhaRelatorio } from "@/lib/relatorio-semanal/gerar";
import { RelatorioSemanal } from "@/components/relatorio-semanal/relatorio";

export const dynamic = "force-dynamic";

export default async function PaginaRelatorioSemanal({ params }: { params: { id: string } }) {
  await exigirPerfil(["gestor", "direcao"]);
  if (!/^[0-9a-f-]{36}$/.test(params.id)) notFound();
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
      textos={r.textos}
      reuniao={r.reuniao ?? {}}
      combinadoAnterior={combinado.length ? combinado : null}
      podeEditar
      voltar="/relatorios"
    />
  );
}
