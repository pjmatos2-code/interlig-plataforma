"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { EMPRESA_GRR } from "@/lib/grr/config-dados";
import type { Participante } from "@/lib/grr/reunioes";
import { SETOR_TECNICO } from "@/lib/grr/tecnico/catalogo";
import { recortesTecnico } from "@/lib/grr/tecnico/dados";
import { carregarTelaTecnico, PERFIS_GRR_TECNICO } from "@/lib/grr/tecnico/tela";
import { segundaDaSemana } from "@/lib/relatorio-semanal/periodo";

/**
 * Ações da reunião operacional do setor técnico (Etapa 2, 21/11/2026). Gravam
 * pelo servidor, depois de conferir o perfil. Reunião encerrada não muda (o
 * banco recusa); compromisso de reunião encerrada só muda de situação.
 */

export type EstadoReuniaoTecnico = { erro?: string; ok?: string };

const texto = (dados: FormData, campo: string, max = 4000) => String(dados.get(campo) ?? "").trim().slice(0, max);
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
const ehId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const somar = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function criarReuniaoTecnicoAcao(_e: EstadoReuniaoTecnico, dados: FormData): Promise<EstadoReuniaoTecnico> {
  const usuario = await exigirPerfil([...PERFIS_GRR_TECNICO]);
  const data = texto(dados, "data");
  const semana = texto(dados, "semana");
  if (!ehData(data) || !ehData(semana)) return { erro: "Informe a data da reunião e a semana analisada." };
  const recortes = await recortesTecnico();
  const recorte = recortes.find((r) => (r.chave.ref ?? "empresa") === texto(dados, "recorte")) ?? recortes[0];
  const inicio = segundaDaSemana(semana);
  const { data: criada, error } = await criarClienteAdmin()
    .from("grr_reunioes")
    .insert({
      empresa: EMPRESA_GRR,
      setor: SETOR_TECNICO,
      modalidade: "operacional",
      escopo_tipo: recorte.chave.tipo,
      escopo_ref: recorte.chave.ref,
      escopo_rotulo: recorte.rotulo,
      responsavel_id: usuario.id,
      responsavel_nome: usuario.nome,
      data_reuniao: data,
      periodo_inicio: inicio,
      periodo_fim: somar(inicio, 6),
      participantes: [{ id: usuario.id, nome: usuario.nome, papel: "coordenacao" }],
      criada_por: usuario.id,
    })
    .select("id")
    .single();
  if (error || !criada) return { erro: error?.message ?? "O banco não registrou a reunião." };
  revalidatePath("/grr/tecnico/reunioes");
  redirect(`/grr/tecnico/reunioes/${criada.id}`);
}

export async function salvarAtaTecnicoAcao(_e: EstadoReuniaoTecnico, dados: FormData): Promise<EstadoReuniaoTecnico> {
  const usuario = await exigirPerfil([...PERFIS_GRR_TECNICO]);
  const id = texto(dados, "id");
  if (!ehId(id)) return { erro: "Reunião inválida." };
  const participantes: Participante[] = [];
  for (const v of dados.getAll("participante")) {
    const [pid, nome, papel] = String(v).split("|");
    if (nome) participantes.push({ id: pid || nome, nome, papel: papel === "coordenacao" ? "coordenacao" : "tecnico" });
  }
  for (const nome of texto(dados, "convidados", 500).split(",").map((s) => s.trim()).filter(Boolean)) participantes.push({ id: nome, nome, papel: "convidado" });
  const { error } = await criarClienteAdmin()
    .from("grr_reunioes")
    .update({ participantes, observacoes: texto(dados, "observacoes") || null, boas_praticas: texto(dados, "boas_praticas") || null })
    .eq("id", id)
    .eq("setor", SETOR_TECNICO)
    .eq("situacao", "aberta");
  if (error) return { erro: error.message };
  void usuario;
  revalidatePath(`/grr/tecnico/reunioes/${id}`);
  return { ok: "Ata salva." };
}

export async function incluirCompromissoTecnicoAcao(_e: EstadoReuniaoTecnico, dados: FormData): Promise<EstadoReuniaoTecnico> {
  const usuario = await exigirPerfil([...PERFIS_GRR_TECNICO]);
  const id = texto(dados, "id");
  const descricao = texto(dados, "descricao", 500);
  const prazo = texto(dados, "prazo");
  if (!ehId(id)) return { erro: "Reunião inválida." };
  if (!descricao) return { erro: "Descreva o compromisso." };
  if (prazo && !ehData(prazo)) return { erro: "Prazo inválido." };
  const { error } = await criarClienteAdmin()
    .from("grr_compromissos")
    .insert({ empresa: EMPRESA_GRR, reuniao_id: id, tipo: "operacional", responsavel_nome: texto(dados, "responsavel", 120) || null, descricao, prazo: prazo || null, criado_por: usuario.id, atualizado_por: usuario.id });
  if (error) return { erro: error.message };
  revalidatePath(`/grr/tecnico/reunioes/${id}`);
  return { ok: "Compromisso incluído." };
}

export async function mudarCompromissoTecnicoAcao(_e: EstadoReuniaoTecnico, dados: FormData): Promise<EstadoReuniaoTecnico> {
  const usuario = await exigirPerfil([...PERFIS_GRR_TECNICO]);
  const id = texto(dados, "compromisso");
  const reuniao = texto(dados, "reuniao");
  const situacao = texto(dados, "situacao");
  if (!ehId(id) || !ehId(reuniao) || !["pendente", "em_andamento", "concluido", "nao_feito", "cancelado"].includes(situacao)) return { erro: "Dados inválidos." };
  const { error } = await criarClienteAdmin().from("grr_compromissos").update({ situacao, conferido_em: reuniao, atualizado_por: usuario.id }).eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath(`/grr/tecnico/reunioes/${reuniao}`);
  return { ok: "Situação atualizada." };
}

/** encerra: guarda os indicadores do período (foto do fechamento quando existe) e a reunião não muda mais */
export async function encerrarReuniaoTecnicoAcao(_e: EstadoReuniaoTecnico, dados: FormData): Promise<EstadoReuniaoTecnico> {
  const usuario = await exigirPerfil([...PERFIS_GRR_TECNICO]);
  const id = texto(dados, "id");
  if (!ehId(id)) return { erro: "Reunião inválida." };
  const admin = criarClienteAdmin();
  const { data: r } = await admin.from("grr_reunioes").select("id, situacao, periodo_inicio, escopo_tipo, escopo_ref, escopo_rotulo").eq("id", id).eq("setor", SETOR_TECNICO).maybeSingle();
  if (!r) return { erro: "Reunião não encontrada." };
  if (r.situacao === "encerrada") return { erro: "A reunião já está encerrada." };
  const tela = await carregarTelaTecnico({ semana: String(r.periodo_inicio), unidade: r.escopo_tipo === "unidade" ? String(r.escopo_rotulo) : undefined });
  const agora = new Date().toISOString();
  const { error } = await admin
    .from("grr_reunioes")
    .update({ situacao: "encerrada", dados: { cartoes: tela.cartoes, porTecnico: tela.porTecnico, turmas: tela.turmas, porRecorte: tela.porRecorte.map((x) => ({ rotulo: x.recorte.rotulo, cartoes: x.cartoes })), encerradaEm: agora, foto: tela.foto }, corte_em: agora, encerrada_em: agora, encerrada_por: usuario.id })
    .eq("id", id)
    .eq("situacao", "aberta");
  if (error) return { erro: error.message };
  revalidatePath(`/grr/tecnico/reunioes/${id}`);
  revalidatePath("/grr/tecnico/reunioes");
  return { ok: "Reunião encerrada. A ata e os números ficaram guardados." };
}
