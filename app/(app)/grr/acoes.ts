"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { indicadorPorChave } from "@/lib/grr/catalogo";
import { SETOR_TECNICO, indicadorTecnico } from "@/lib/grr/tecnico/catalogo";
import { numeroBr, validarMeta } from "@/lib/grr/config";
import { EMPRESA_GRR, SETOR_GRR } from "@/lib/grr/config-dados";
import { congelarSemana } from "@/lib/grr/fotos-dados";
import { resolverSemana } from "@/lib/grr/semana";
import { hojeSantarem, segundaDaSemana } from "@/lib/relatorio-semanal/periodo";
import { criarClienteServidor } from "@/lib/supabase/server";

export type EstadoGrr = { erro?: string; ok?: string };

const texto = (dados: FormData, campo: string) => String(dados.get(campo) ?? "").trim();
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

/** congela a semana pedida (administração e direção); semana já congelada exige o motivo */
export async function congelarSemanaAcao(_estado: EstadoGrr, dados: FormData): Promise<EstadoGrr> {
  const usuario = await exigirPerfil(["gestor", "direcao"]);
  const pedida = texto(dados, "semana");
  if (!ehData(pedida)) return { erro: "Semana inválida." };
  const semana = resolverSemana(pedida, hojeSantarem());
  if (semana.inicio !== pedida) return { erro: "Semana inválida." };
  try {
    const r = await congelarSemana(semana, { usuarioId: usuario.id, motivo: texto(dados, "motivo") || null });
    revalidatePath("/grr", "layout");
    return { ok: `Semana congelada na versão ${r.versao}, em ${r.recortes} recortes.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível congelar a semana." };
  }
}

/**
 * Encerramento da reunião no Modo Apresentação (direção e administração):
 * congela a semana completa com origem "reunião". Se a semana já tem foto,
 * nada muda: os números apresentados já estão preservados.
 */
export async function encerrarReuniaoAcao(_estado: EstadoGrr, dados: FormData): Promise<EstadoGrr> {
  const usuario = await exigirPerfil(["gestor", "direcao"]);
  const pedida = texto(dados, "semana");
  if (!ehData(pedida)) return { erro: "Semana inválida." };
  const semana = resolverSemana(pedida, hojeSantarem());
  if (semana.inicio !== pedida) return { erro: "Semana inválida." };
  try {
    const r = await congelarSemana(semana, { usuarioId: usuario.id, motivo: null, origem: "reuniao" });
    revalidatePath("/grr", "layout");
    revalidatePath("/apresentacao/grr");
    return { ok: `Reunião encerrada: semana congelada na versão ${r.versao}, em ${r.recortes} recortes.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível encerrar a reunião." };
  }
}

/** liga ou desliga um indicador e define o dono (só a administração) */
export async function salvarIndicadorAcao(_estado: EstadoGrr, dados: FormData): Promise<EstadoGrr> {
  const usuario = await exigirPerfil(["gestor"]);
  const def = indicadorPorChave(texto(dados, "chave"));
  if (!def) return { erro: "Indicador desconhecido." };
  const dono = texto(dados, "dono").slice(0, 80) || null;
  const { error } = await criarClienteServidor()
    .from("grr_indicadores")
    .upsert(
      { empresa: EMPRESA_GRR, setor: SETOR_GRR, chave: def.chave, ativo: dados.get("ativo") === "on", dono, atualizado_em: new Date().toISOString(), atualizado_por: usuario.id },
      { onConflict: "empresa,setor,chave" }
    );
  if (error) return { erro: error.message };
  revalidatePath("/grr", "layout");
  return { ok: "Salvo." };
}

/**
 * Inclui uma meta com a faixa de atenção (só a administração). Meta não se
 * altera: cada mudança é uma linha nova, com a semana em que começa a valer.
 * "Encerrar" inclui uma linha sem meta a partir daquela semana.
 */
export async function incluirMetaAcao(_estado: EstadoGrr, dados: FormData): Promise<EstadoGrr> {
  const usuario = await exigirPerfil(["gestor"]);
  // setor técnico (21/11/2026): mesmas regras, catálogo próprio e só empresa ou unidade
  const tecnico = texto(dados, "setor") === SETOR_TECNICO;
  const def = tecnico ? indicadorTecnico(texto(dados, "indicador")) : indicadorPorChave(texto(dados, "indicador"));
  if (!def || (!tecnico && (def as { metaOrigem?: string }).metaOrigem !== "grr")) return { erro: "Este indicador não tem meta configurável no GRR." };
  const desde = texto(dados, "desde");
  if (!ehData(desde)) return { erro: "Informe a data em que a meta começa a valer." };
  const [tipo, ref] = texto(dados, "escopo").split(":");
  const tipos = tecnico ? ["empresa", "unidade"] : ["empresa", "unidade", "equipe", "agente"];
  if (!tipos.includes(tipo) || (tipo === "empresa") !== !ref) return { erro: "Recorte inválido." };

  const encerrar = dados.get("encerrar") === "on";
  let meta: number | null = null;
  let limite: number | null = null;
  if (!encerrar) {
    const fator = def.unidade === "percentual" ? 100 : 1;
    const m = numeroBr(texto(dados, "meta"));
    const l = numeroBr(texto(dados, "limite"));
    if (m == null || l == null) return { erro: "Informe a meta e o limite de atenção." };
    meta = m / fator;
    limite = l / fator;
    const problema = validarMeta(def, meta, limite);
    if (problema) return { erro: problema };
  }
  const { error } = await criarClienteServidor().from("grr_metas").insert({
    empresa: EMPRESA_GRR,
    setor: tecnico ? SETOR_TECNICO : SETOR_GRR,
    indicador: def.chave,
    escopo_tipo: tipo,
    escopo_ref: ref || null,
    vigente_desde: segundaDaSemana(desde),
    meta,
    limite_atencao: limite,
    observacao: texto(dados, "observacao").slice(0, 200) || null,
    criado_por: usuario.id,
  });
  if (error) return { erro: error.message };
  revalidatePath("/grr", "layout");
  return { ok: encerrar ? "Meta encerrada a partir da semana escolhida." : "Meta incluída." };
}
