"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { gerarRelatorio, reescreverTextos } from "@/lib/relatorio-semanal/gerar";
import { semanaDe } from "@/lib/relatorio-semanal/periodo";

/** quem gera, lê e preenche o relatório da diretoria */
const PERFIS = ["gestor", "direcao"] as const;

export async function gerarRelatorioAgora(semanaInicio: string): Promise<{ erro?: string; id?: string; aviso?: string }> {
  const usuario = await exigirPerfil([...PERFIS]);
  let semana;
  try {
    semana = semanaDe(semanaInicio);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
  try {
    const r = await gerarRelatorio(semana, usuario.id);
    revalidatePath("/relatorios", "layout");
    return { id: r.id, aviso: r.erroTextos ? `Números prontos, mas os textos falharam: ${r.erroTextos}. Use "Reescrever textos".` : undefined };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function reescreverTextosAgora(id: string): Promise<{ erro?: string }> {
  await exigirPerfil([...PERFIS]);
  if (!/^[0-9a-f-]{36}$/.test(id)) return { erro: "Relatório inválido." };
  const erro = await reescreverTextos(id);
  revalidatePath("/relatorios", "layout");
  return erro ? { erro } : {};
}

/** um campo da reunião (resposta, checklist, responsável) */
export async function salvarCampoReuniao(id: string, campo: string, valor: string): Promise<{ erro?: string }> {
  const usuario = await exigirPerfil([...PERFIS]);
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[a-z0-9-]{1,20}$/.test(campo)) return { erro: "Campo inválido." };
  const { error } = await criarClienteAdmin().rpc("relatorio_reuniao_campo", {
    p_id: id,
    p_campo: campo,
    p_valor: String(valor ?? "").slice(0, 4000),
    p_usuario: usuario.id,
  });
  return error ? { erro: error.message } : {};
}
