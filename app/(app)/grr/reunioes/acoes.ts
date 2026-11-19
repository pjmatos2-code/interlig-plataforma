"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirPerfil } from "@/lib/auth";
import { carregarCadastroGrr } from "@/lib/grr/dados";
import { indicadoresDaReuniao, lerReuniao, montarFotoDaReuniao } from "@/lib/grr/reunioes-dados";
import { lerParticipantes, participantesSugeridos, podeConduzir, recortesPermitidos, type SituacaoCompromisso } from "@/lib/grr/reunioes";
import { resolverSemana } from "@/lib/grr/semana";
import { hojeSantarem, mesDeReferencia } from "@/lib/relatorio-semanal/periodo";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Ações da Reunião Semanal da Equipe Comercial. Cada uma confere o perfil e o
 * recorte aqui e o banco confere de novo (permissão por linha e gatilhos).
 */

export type EstadoReuniao = { erro?: string; ok?: string };
const PERFIS = ["gestor", "direcao", "supervisor"] as const;
const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const ehId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const SITUACOES: SituacaoCompromisso[] = ["pendente", "em_andamento", "concluido", "nao_feito", "cancelado"];

async function conferirConducao(id: string) {
  const usuario = await exigirPerfil([...PERFIS]);
  const r = await lerReuniao(id);
  if (!r) return { erro: "Reunião não encontrada." as const };
  const cadastro = await carregarCadastroGrr(mesDeReferencia(resolverSemana(r.reuniao.periodo_inicio, hojeSantarem())).de);
  if (!podeConduzir(usuario, r.reuniao, cadastro)) return { erro: "Só a coordenação desta equipe, a administração e a direção conduzem esta reunião." as const };
  return { usuario, r, cadastro };
}

export async function criarReuniaoAcao(_e: EstadoReuniao, f: FormData): Promise<EstadoReuniao> {
  const usuario = await exigirPerfil([...PERFIS]);
  const [tipo, ref] = texto(f, "recorte").split(":");
  const data = texto(f, "data");
  const periodo = texto(f, "periodo");
  if (!ehData(data)) return { erro: "Informe a data da reunião." };
  const hoje = hojeSantarem();
  const semana = resolverSemana(periodo || data, hoje);
  const cadastro = await carregarCadastroGrr(mesDeReferencia(semana).de);
  const recorte = recortesPermitidos(usuario, cadastro).find((x) => x.tipo === tipo && x.ref === ref);
  if (!recorte) return { erro: "Escolha uma equipe ou unidade que você coordena." };
  const equipe = recorte.tipo === "equipe" ? cadastro.equipes.find((e) => e.coordenadorId === recorte.ref) : null;
  const responsavel = equipe ? { id: equipe.coordenadorId, nome: equipe.nome } : { id: usuario.id, nome: usuario.nome };
  const participantes = participantesSugeridos({ escopo_tipo: recorte.tipo, escopo_ref: recorte.ref }, cadastro);
  const { data: criada, error } = await criarClienteServidor()
    .from("grr_reunioes")
    .insert({
      modalidade: "equipe",
      escopo_tipo: recorte.tipo,
      escopo_ref: recorte.ref,
      escopo_rotulo: recorte.rotulo,
      responsavel_id: responsavel.id,
      responsavel_nome: responsavel.nome,
      data_reuniao: data,
      periodo_inicio: semana.inicio,
      periodo_fim: semana.fim,
      participantes,
      criada_por: usuario.id,
    })
    .select("id")
    .single();
  if (error || !criada) return { erro: error?.message.includes("does not exist") ? "As tabelas de reuniões ainda não existem no banco (migração 0135)." : `O banco recusou: ${error?.message}` };
  revalidatePath("/grr/reunioes");
  redirect(`/grr/reunioes/${criada.id}`);
}

export async function salvarReuniaoAcao(_e: EstadoReuniao, f: FormData): Promise<EstadoReuniao> {
  const id = texto(f, "id");
  if (!ehId(id)) return { erro: "Reunião inválida." };
  const c = await conferirConducao(id);
  if ("erro" in c) return { erro: c.erro };
  if (c.r.reuniao.situacao === "encerrada") return { erro: "Reunião encerrada: registre uma correção." };
  const data = texto(f, "data");
  const participantes = lerParticipantes(f.getAll("participante").map(String), participantesSugeridos(c.r.reuniao, c.cadastro), texto(f, "convidados"));
  const { error } = await criarClienteServidor()
    .from("grr_reunioes")
    .update({
      data_reuniao: ehData(data) ? data : c.r.reuniao.data_reuniao,
      participantes,
      observacoes: texto(f, "observacoes").slice(0, 4000) || null,
      boas_praticas: texto(f, "boas_praticas").slice(0, 4000) || null,
    })
    .eq("id", id);
  if (error) return { erro: `O banco recusou: ${error.message}` };
  revalidatePath(`/grr/reunioes/${id}`);
  return { ok: "Reunião salva." };
}

export async function incluirCompromissoAcao(_e: EstadoReuniao, f: FormData): Promise<EstadoReuniao> {
  const id = texto(f, "id");
  if (!ehId(id)) return { erro: "Reunião inválida." };
  const c = await conferirConducao(id);
  if ("erro" in c) return { erro: c.erro };
  if (c.r.reuniao.situacao === "encerrada") return { erro: "Reunião encerrada: o compromisso entra na próxima reunião." };
  const descricao = texto(f, "descricao").slice(0, 500);
  if (!descricao) return { erro: "Descreva o compromisso." };
  const prazo = texto(f, "prazo");
  const gerencial = texto(f, "tipo") === "gerencial";
  const agente = texto(f, "agente");
  const quem = participantesSugeridos(c.r.reuniao, c.cadastro).find((p) => p.id === agente && p.papel === "agente") ?? null;
  const { error } = await criarClienteServidor()
    .from("grr_compromissos")
    .insert({
      reuniao_id: id,
      tipo: gerencial ? "gerencial" : "operacional",
      aprovacao: gerencial ? "aguardando" : "nao_se_aplica",
      agente_id: quem?.id ?? null,
      responsavel_nome: quem?.nome ?? (texto(f, "responsavel").slice(0, 60) || "Equipe"),
      descricao,
      prazo: ehData(prazo) ? prazo : null,
      criado_por: c.usuario.id,
    });
  if (error) return { erro: `O banco recusou: ${error.message}` };
  revalidatePath(`/grr/reunioes/${id}`);
  return { ok: gerencial ? "Compromisso gerencial incluído: aguarda a diretoria." : "Compromisso incluído." };
}

/** situação de um compromisso (desta reunião ou da anterior, conferido nesta) */
export async function situacaoCompromissoAcao(_e: EstadoReuniao, f: FormData): Promise<EstadoReuniao> {
  const id = texto(f, "id");
  const compromisso = texto(f, "compromisso");
  const situacao = texto(f, "situacao") as SituacaoCompromisso;
  if (!ehId(id) || !ehId(compromisso) || !SITUACOES.includes(situacao)) return { erro: "Dados inválidos." };
  const c = await conferirConducao(id);
  if ("erro" in c) return { erro: c.erro };
  const daqui = [...c.r.compromissos, ...c.r.daAnterior].some((x) => x.id === compromisso);
  if (!daqui) return { erro: "Compromisso não pertence a esta reunião nem à anterior." };
  const { error } = await criarClienteServidor().from("grr_compromissos").update({ situacao, conferido_em: id, atualizado_por: c.usuario.id }).eq("id", compromisso);
  if (error) return { erro: `O banco recusou: ${error.message}` };
  revalidatePath(`/grr/reunioes/${id}`);
  return { ok: "Situação atualizada." };
}

/** aprovação de compromisso gerencial: só a diretoria (direção e administração) */
export async function aprovacaoCompromissoAcao(_e: EstadoReuniao, f: FormData): Promise<EstadoReuniao> {
  const usuario = await exigirPerfil(["gestor", "direcao"]);
  const id = texto(f, "id");
  const compromisso = texto(f, "compromisso");
  const aprovacao = texto(f, "aprovacao");
  if (!ehId(id) || !ehId(compromisso) || !["aprovado", "ajuste", "rejeitado"].includes(aprovacao)) return { erro: "Dados inválidos." };
  const { error } = await criarClienteServidor().from("grr_compromissos").update({ aprovacao, atualizado_por: usuario.id }).eq("id", compromisso).eq("tipo", "gerencial");
  if (error) return { erro: `O banco recusou: ${error.message}` };
  revalidatePath(`/grr/reunioes/${id}`);
  return { ok: "Decisão registrada." };
}

/** encerra: guarda a foto dos indicadores, metas, comparativos, participantes e compromissos */
export async function encerrarReuniaoEquipeAcao(_e: EstadoReuniao, f: FormData): Promise<EstadoReuniao> {
  const id = texto(f, "id");
  if (!ehId(id)) return { erro: "Reunião inválida." };
  const c = await conferirConducao(id);
  if ("erro" in c) return { erro: c.erro };
  if (c.r.reuniao.situacao === "encerrada") return { erro: "A reunião já está encerrada." };
  const { dados } = await indicadoresDaReuniao(c.r.reuniao, c.usuario.id, c.cadastro);
  const foto = montarFotoDaReuniao(dados, c.r.reuniao, c.r.compromissos, c.r.daAnterior);
  const agora = new Date().toISOString();
  const { error } = await criarClienteServidor()
    .from("grr_reunioes")
    .update({ situacao: "encerrada", dados: foto, corte_em: agora, encerrada_em: agora, encerrada_por: c.usuario.id })
    .eq("id", id)
    .eq("situacao", "aberta");
  if (error) return { erro: `O banco recusou: ${error.message}` };
  revalidatePath(`/grr/reunioes/${id}`);
  revalidatePath("/grr/reunioes");
  return { ok: "Reunião encerrada: indicadores, participantes e compromissos guardados." };
}

/** correção depois do encerramento: entra como registro, sem mexer no original */
export async function registrarCorrecaoAcao(_e: EstadoReuniao, f: FormData): Promise<EstadoReuniao> {
  const id = texto(f, "id");
  const correcao = texto(f, "texto").slice(0, 2000);
  if (!ehId(id) || !correcao) return { erro: "Descreva a correção." };
  const c = await conferirConducao(id);
  if ("erro" in c) return { erro: c.erro };
  const { error } = await criarClienteServidor().from("grr_reuniao_registros").insert({ reuniao_id: id, tipo: "correcao", texto: correcao, criado_por: c.usuario.id });
  if (error) return { erro: `O banco recusou: ${error.message}` };
  revalidatePath(`/grr/reunioes/${id}`);
  return { ok: "Correção registrada." };
}
