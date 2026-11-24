"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirPerfil } from "@/lib/auth";
import { carregarCadastroGrr } from "@/lib/grr/dados";
import { congelarSemana } from "@/lib/grr/fotos-dados";
import { avisar } from "@/lib/grr/planos-dados";
import { incluirDecisao, lerAta, lerParticipantesDiretoria, PAUTA_DIRETORIA, removerDecisao, type ReuniaoGrr } from "@/lib/grr/reunioes";
import { lerReuniao, participantesPossiveisDiretoria, pautaDaReuniao, type FotoReuniaoDiretoria } from "@/lib/grr/reunioes-dados";
import { resolverSemana } from "@/lib/grr/semana";
import { carregarRotinas } from "@/lib/grr/rotinas-dados";
import { hojeSantarem, mesDeReferencia } from "@/lib/relatorio-semanal/periodo";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Ações da reunião de resultados da diretoria (Etapa 4). Só direção e
 * administração criam, conduzem e encerram; o banco confere de novo.
 */

export type EstadoDiretoria = { erro?: string; ok?: string };
const DIRETORIA = ["gestor", "direcao"] as const;
const texto = (f: FormData, k: string, max = 4000) => String(f.get(k) ?? "").trim().slice(0, max);
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const ehId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

async function reuniaoAberta(id: string): Promise<{ erro: string } | { usuario: Awaited<ReturnType<typeof exigirPerfil>>; r: ReuniaoGrr }> {
  const usuario = await exigirPerfil([...DIRETORIA]);
  if (!ehId(id)) return { erro: "Reunião inválida." };
  const lida = await lerReuniao(id);
  if (!lida || lida.reuniao.modalidade !== "diretoria") return { erro: "Reunião não encontrada." };
  if (lida.reuniao.situacao === "encerrada") return { erro: "Reunião encerrada: registre uma correção." };
  return { usuario, r: lida.reuniao };
}

export async function criarReuniaoDiretoriaAcao(_e: EstadoDiretoria, f: FormData): Promise<EstadoDiretoria> {
  const usuario = await exigirPerfil([...DIRETORIA]);
  const data = texto(f, "data");
  if (!ehData(data)) return { erro: "Informe a data da reunião." };
  const semana = resolverSemana(texto(f, "periodo") || "ultima", hojeSantarem());
  const cadastro = await carregarCadastroGrr(mesDeReferencia(semana).de);
  const recorte = texto(f, "recorte");
  const pop = recorte.startsWith("unidade:") ? cadastro.pops.find((p) => `unidade:${p.id}` === recorte) ?? null : null;
  if (recorte !== "empresa" && !pop) return { erro: "Escolha a empresa ou uma unidade." };
  const possiveis = await participantesPossiveisDiretoria();
  const { data: criada, error } = await criarClienteServidor()
    .from("grr_reunioes")
    .insert({
      modalidade: "diretoria",
      escopo_tipo: pop ? "unidade" : "empresa",
      escopo_ref: pop?.id ?? null,
      escopo_rotulo: pop ? `Unidade ${pop.nome}` : "Empresa",
      responsavel_id: usuario.id,
      responsavel_nome: usuario.nome,
      data_reuniao: data,
      periodo_inicio: semana.inicio,
      periodo_fim: semana.fim,
      // chamados: a diretoria e a coordenação ativas (a lista é ajustada na preparação)
      participantes: lerParticipantesDiretoria(possiveis.map((p) => p.id), possiveis, ""),
      ata: { pauta: {}, decisoes: [] },
      criada_por: usuario.id,
    })
    .select("id")
    .single();
  if (error || !criada) return { erro: `O banco recusou: ${error?.message ?? ""}` };
  revalidatePath("/grr/reunioes");
  redirect(`/grr/reunioes/${criada.id}`);
}

/** data, participantes e anotações da pauta */
export async function salvarPreparacaoAcao(_e: EstadoDiretoria, f: FormData): Promise<EstadoDiretoria> {
  const c = await reuniaoAberta(texto(f, "id"));
  if ("erro" in c) return { erro: c.erro };
  const ata = lerAta(c.r.ata);
  for (const item of PAUTA_DIRETORIA) {
    if (f.has(`pauta_${item.chave}`)) {
      const t = texto(f, `pauta_${item.chave}`);
      if (t) ata.pauta[item.chave] = t;
      else delete ata.pauta[item.chave];
    }
  }
  const data = texto(f, "data");
  const mudancas: Record<string, unknown> = { ata };
  if (ehData(data)) mudancas.data_reuniao = data;
  if (f.has("participantes_enviados")) mudancas.participantes = lerParticipantesDiretoria(f.getAll("participante").map(String), await participantesPossiveisDiretoria(), texto(f, "convidados", 600));
  const { error } = await criarClienteServidor().from("grr_reunioes").update(mudancas).eq("id", c.r.id);
  if (error) return { erro: `O banco recusou: ${error.message}` };
  revalidatePath(`/grr/reunioes/${c.r.id}`);
  return { ok: "Salvo." };
}

export async function incluirDecisaoAcao(_e: EstadoDiretoria, f: FormData): Promise<EstadoDiretoria> {
  const c = await reuniaoAberta(texto(f, "id"));
  if ("erro" in c) return { erro: c.erro };
  const decisao = texto(f, "texto", 600);
  if (!decisao) return { erro: "Escreva a decisão." };
  const prazo = texto(f, "prazo");
  const ata = incluirDecisao(lerAta(c.r.ata), { texto: decisao, responsavel: texto(f, "responsavel", 80), prazo: ehData(prazo) ? prazo : null }, randomUUID());
  const { error } = await criarClienteServidor().from("grr_reunioes").update({ ata }).eq("id", c.r.id);
  if (error) return { erro: `O banco recusou: ${error.message}` };
  revalidatePath(`/grr/reunioes/${c.r.id}`);
  revalidatePath("/apresentacao/grr");
  return { ok: "Decisão registrada." };
}

export async function removerDecisaoAcao(_e: EstadoDiretoria, f: FormData): Promise<EstadoDiretoria> {
  const c = await reuniaoAberta(texto(f, "id"));
  if ("erro" in c) return { erro: c.erro };
  const { error } = await criarClienteServidor().from("grr_reunioes").update({ ata: removerDecisao(lerAta(c.r.ata), texto(f, "decisao", 40)) }).eq("id", c.r.id);
  if (error) return { erro: `O banco recusou: ${error.message}` };
  revalidatePath(`/grr/reunioes/${c.r.id}`);
  revalidatePath("/apresentacao/grr");
  return { ok: "Decisão retirada." };
}

/**
 * Encerramento oficial (só a diretoria): congela a semana, se ainda não
 * estiver congelada, e guarda na reunião a foto dos indicadores, os
 * diagnósticos, os planos, os participantes e a ata. Avisa os participantes.
 */
export async function encerrarReuniaoDiretoriaAcao(_e: EstadoDiretoria, f: FormData): Promise<EstadoDiretoria> {
  const c = await reuniaoAberta(texto(f, "id"));
  if ("erro" in c) return { erro: c.erro };
  const semana = resolverSemana(c.r.periodo_inicio, hojeSantarem());
  let pauta = await pautaDaReuniao(c.r, c.usuario.id);
  if (semana.fim < hojeSantarem() && pauta.fotoVersao == null) {
    try {
      await congelarSemana(semana, { usuarioId: c.usuario.id, motivo: null, origem: "reuniao" });
      pauta = await pautaDaReuniao(c.r, c.usuario.id);
    } catch (e) {
      return { erro: e instanceof Error ? `Não foi possível congelar a semana: ${e.message}` : "Não foi possível congelar a semana." };
    }
  }
  const foto: FotoReuniaoDiretoria = {
    indicadores: { ...pauta.indicadores, tickets: [] },
    fotoVersao: pauta.fotoVersao,
    diagnosticos: pauta.diagnosticos,
    planos: pauta.planos,
    participantes: c.r.participantes,
    panorama: pauta.panorama ?? null,
    ata: lerAta(c.r.ata),
    rotinas: await carregarRotinas([semana], c.usuario, semana).then((r) => r[0]?.lideres ?? []).catch(() => []),
  };
  const agora = new Date().toISOString();
  const { error } = await criarClienteServidor()
    .from("grr_reunioes")
    .update({ situacao: "encerrada", dados: foto, corte_em: agora, encerrada_em: agora, encerrada_por: c.usuario.id })
    .eq("id", c.r.id)
    .eq("situacao", "aberta");
  if (error) return { erro: `O banco recusou: ${error.message}` };
  await avisar(
    c.r.participantes.map((p) => p.id),
    { titulo: "📝 Ata da reunião de resultados", descricao: `${c.r.escopo_rotulo} · ${foto.ata.decisoes.length} decisões registradas`, link: `/grr/reunioes/${c.r.id}` },
    c.usuario.id
  ).catch(() => {});
  revalidatePath("/grr", "layout");
  revalidatePath("/apresentacao/grr");
  return { ok: "Reunião encerrada: números, diagnósticos, planos e decisões guardados." };
}

/** correção depois do encerramento (diretoria): entra como registro, sem mexer na ata */
export async function corrigirReuniaoDiretoriaAcao(_e: EstadoDiretoria, f: FormData): Promise<EstadoDiretoria> {
  const usuario = await exigirPerfil([...DIRETORIA]);
  const id = texto(f, "id");
  const correcao = texto(f, "texto", 2000);
  if (!ehId(id) || !correcao) return { erro: "Descreva a correção." };
  const { error } = await criarClienteServidor().from("grr_reuniao_registros").insert({ reuniao_id: id, tipo: "correcao", texto: correcao, criado_por: usuario.id });
  if (error) return { erro: `O banco recusou: ${error.message}` };
  revalidatePath(`/grr/reunioes/${id}`);
  return { ok: "Correção registrada." };
}
