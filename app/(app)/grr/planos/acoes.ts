"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { indicadorPorChave } from "@/lib/grr/catalogo";
import { aplicarConfig } from "@/lib/grr/config";
import { lerConfigGrr } from "@/lib/grr/config-dados";
import { carregarCadastroGrr, carregarGrrComercial } from "@/lib/grr/dados";
import { chaveDoEscopo } from "@/lib/grr/fotos";
import { proximaVersaoDiagnostico, situacoesPermitidas, type AprovacaoPlano, type SituacaoPlano } from "@/lib/grr/planos";
import { avisar, idsDaDiretoria, lerPlano, responsaveisPossiveis } from "@/lib/grr/planos-dados";
import { escopoDoRecorte, lerRecorte, recortesDePlano } from "@/lib/grr/recortes";
import { resolverSemana } from "@/lib/grr/semana";
import { hojeSantarem, mesDeReferencia } from "@/lib/relatorio-semanal/periodo";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Ações da Etapa 3 (diagnósticos e planos). O perfil e o recorte são
 * conferidos aqui e de novo no banco (permissão por linha e gatilhos). Os
 * números guardados com o diagnóstico são recalculados no servidor.
 */

export type EstadoPlano = { erro?: string; ok?: string };
const PERFIS = ["gestor", "direcao", "supervisor"] as const;
const texto = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const ehId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const erroDoBanco = (m: string) => (m.includes("does not exist") || m.includes("schema cache") ? "As tabelas da Etapa 3 ainda não existem no banco (migração 0136)." : `O banco recusou: ${m}`);

async function contexto(f: FormData) {
  const usuario = await exigirPerfil([...PERFIS]);
  const semana = resolverSemana(texto(f, "semana") || undefined, hojeSantarem());
  const cadastro = await carregarCadastroGrr(mesDeReferencia(semana).de);
  const recorte = lerRecorte(texto(f, "recorte"), recortesDePlano(usuario, cadastro));
  return { usuario, semana, cadastro, recorte };
}

export async function salvarDiagnosticoAcao(_e: EstadoPlano, f: FormData): Promise<EstadoPlano> {
  const { usuario, semana, cadastro, recorte } = await contexto(f);
  if (!recorte) return { erro: "Você não registra diagnóstico neste recorte." };
  const def = indicadorPorChave(texto(f, "indicador"));
  if (!def) return { erro: "Indicador desconhecido." };
  const causa = texto(f, "causa");
  if (!causa) return { erro: "Descreva a causa identificada." };
  const db = criarClienteServidor();
  let existentes = db.from("grr_diagnosticos").select("versao").eq("periodo_inicio", semana.inicio).eq("indicador", def.chave).eq("escopo_tipo", recorte.tipo);
  existentes = recorte.ref ? existentes.eq("escopo_ref", recorte.ref) : existentes.is("escopo_ref", null);
  const [{ data: versoes, error: erroVersoes }, dados, config] = await Promise.all([existentes, carregarGrrComercial(semana, escopoDoRecorte(recorte, cadastro), cadastro), lerConfigGrr()]);
  if (erroVersoes) return { erro: erroDoBanco(erroVersoes.message) };
  const escopo = escopoDoRecorte(recorte, cadastro);
  const cartao = aplicarConfig(dados.cartoes, config, chaveDoEscopo(escopo, usuario.id), semana.inicio).find((c) => c.chave === def.chave);
  const { error } = await db.from("grr_diagnosticos").insert({
    periodo_inicio: semana.inicio,
    periodo_fim: semana.fim,
    indicador: def.chave,
    escopo_tipo: recorte.tipo,
    escopo_ref: recorte.ref,
    escopo_rotulo: recorte.rotulo,
    versao: proximaVersaoDiagnostico((versoes ?? []).map((v) => Number(v.versao))),
    causa,
    evidencias: texto(f, "evidencias") || null,
    providencias: texto(f, "providencias") || null,
    solucao: texto(f, "solucao") || null,
    situacao_indicador: cartao?.status ?? null,
    valor: cartao?.valor ?? null,
    meta: cartao?.meta ?? null,
    criado_por: usuario.id,
  });
  if (error) return { erro: erroDoBanco(error.message) };
  revalidatePath("/grr", "layout");
  return { ok: "Diagnóstico salvo. As versões anteriores ficam no histórico." };
}

export async function criarPlanoAcao(_e: EstadoPlano, f: FormData): Promise<EstadoPlano> {
  const { usuario, semana, recorte } = await contexto(f);
  if (!recorte) return { erro: "Você não propõe plano neste recorte." };
  const indicador = indicadorPorChave(texto(f, "indicador"))?.chave ?? null;
  const problema = texto(f, "problema", 300) || null;
  if (!indicador && !problema) return { erro: "Escolha o indicador ou descreva o problema." };
  const descricao = texto(f, "descricao", 600);
  if (!descricao) return { erro: "Descreva a ação." };
  const prazo = texto(f, "prazo");
  const responsavelId = texto(f, "responsavel_id");
  const possiveis = await responsaveisPossiveis();
  const daLista = possiveis.find((p) => p.id === responsavelId) ?? null;
  const responsavelNome = daLista?.nome ?? texto(f, "responsavel_nome", 80);
  if (!responsavelNome) return { erro: "Informe o responsável principal." };
  const diagnostico = texto(f, "diagnostico_id");
  const db = criarClienteServidor();
  const { data: criado, error } = await db
    .from("grr_acoes")
    .insert({
      indicador,
      problema,
      periodo_inicio: semana.inicio,
      escopo_tipo: recorte.tipo,
      escopo_ref: recorte.ref,
      escopo_rotulo: recorte.rotulo,
      diagnostico_id: ehId(diagnostico) ? diagnostico : null,
      descricao,
      resultado_esperado: texto(f, "resultado", 600) || null,
      responsavel_id: daLista?.id ?? null,
      responsavel_nome: responsavelNome,
      prazo: ehData(prazo) ? prazo : null,
      criado_por: usuario.id,
    })
    .select("id")
    .single();
  if (error || !criado) return { erro: erroDoBanco(error?.message ?? "") };
  await db.from("grr_acao_eventos").insert({ acao_id: criado.id, tipo: "criada", texto: descricao, criado_por: usuario.id });
  await avisar(
    [...(await idsDaDiretoria()), daLista?.id],
    { titulo: "📋 Plano de ação aguardando aprovação", descricao: `${recorte.rotulo}: ${descricao}`, link: `/grr/planos/${criado.id}` },
    usuario.id
  ).catch(() => {});
  revalidatePath("/grr", "layout");
  return { ok: "Plano proposto. A diretoria foi avisada para aprovar." };
}

export async function situacaoPlanoAcao(_e: EstadoPlano, f: FormData): Promise<EstadoPlano> {
  const usuario = await exigirPerfil([...PERFIS]);
  const id = texto(f, "id");
  const situacao = texto(f, "situacao") as SituacaoPlano;
  const lido = ehId(id) ? await lerPlano(id) : null;
  if (!lido) return { erro: "Plano não encontrado." };
  if (!situacoesPermitidas(usuario.perfil, lido.plano).includes(situacao)) return { erro: "Essa mudança de situação não é sua: validar e concluir é da diretoria." };
  if (lido.plano.aprovacao === "rejeitado") return { erro: "Plano rejeitado não volta para a execução." };
  const { error } = await criarClienteServidor().from("grr_acoes").update({ situacao, atualizado_por: usuario.id }).eq("id", id);
  if (error) return { erro: erroDoBanco(error.message) };
  const p = lido.plano;
  if (situacao === "aguardando_validacao")
    await avisar(await idsDaDiretoria(), { titulo: "✅ Plano aguardando validação", descricao: `${p.escopo_rotulo}: ${p.descricao}`, link: `/grr/planos/${id}` }, usuario.id).catch(() => {});
  if (situacao === "concluida")
    await avisar([p.criado_por, p.responsavel_id], { titulo: "🏁 Plano validado e concluído", descricao: p.descricao, link: `/grr/planos/${id}` }, usuario.id).catch(() => {});
  revalidatePath("/grr", "layout");
  return { ok: "Situação atualizada." };
}

export async function aprovacaoPlanoAcao(_e: EstadoPlano, f: FormData): Promise<EstadoPlano> {
  const usuario = await exigirPerfil(["gestor", "direcao"]);
  const id = texto(f, "id");
  const aprovacao = texto(f, "aprovacao") as AprovacaoPlano;
  const justificativa = texto(f, "justificativa", 1000);
  if (!ehId(id) || !["aprovado", "ajuste", "rejeitado"].includes(aprovacao)) return { erro: "Dados inválidos." };
  if (aprovacao !== "aprovado" && !justificativa) return { erro: "Para pedir ajuste ou rejeitar, escreva a justificativa." };
  const lido = await lerPlano(id);
  if (!lido) return { erro: "Plano não encontrado." };
  const { error } = await criarClienteServidor()
    .from("grr_acoes")
    .update({ aprovacao, aprovacao_justificativa: justificativa || null, atualizado_por: usuario.id })
    .eq("id", id);
  if (error) return { erro: erroDoBanco(error.message) };
  const titulo = aprovacao === "aprovado" ? "👍 Plano de ação aprovado" : aprovacao === "ajuste" ? "✏️ Diretoria pediu ajuste no plano" : "⛔ Plano de ação rejeitado";
  await avisar([lido.plano.criado_por, lido.plano.responsavel_id], { titulo, descricao: justificativa || lido.plano.descricao, link: `/grr/planos/${id}` }, usuario.id).catch(() => {});
  revalidatePath("/grr", "layout");
  return { ok: "Decisão registrada." };
}

/** depois de um pedido de ajuste: o recorte corrige e reenvia para a diretoria */
export async function reenviarPlanoAcao(_e: EstadoPlano, f: FormData): Promise<EstadoPlano> {
  const usuario = await exigirPerfil([...PERFIS]);
  const id = texto(f, "id");
  const lido = ehId(id) ? await lerPlano(id) : null;
  if (!lido) return { erro: "Plano não encontrado." };
  if (lido.plano.aprovacao !== "ajuste") return { erro: "Só plano com ajuste pedido é reenviado." };
  const descricao = texto(f, "descricao", 600);
  if (!descricao) return { erro: "Descreva a ação." };
  const prazo = texto(f, "prazo");
  const { error } = await criarClienteServidor()
    .from("grr_acoes")
    .update({ aprovacao: "aguardando", descricao, resultado_esperado: texto(f, "resultado", 600) || null, prazo: ehData(prazo) ? prazo : lido.plano.prazo, atualizado_por: usuario.id })
    .eq("id", id);
  if (error) return { erro: erroDoBanco(error.message) };
  await avisar(await idsDaDiretoria(), { titulo: "📋 Plano ajustado aguardando aprovação", descricao: `${lido.plano.escopo_rotulo}: ${descricao}`, link: `/grr/planos/${id}` }, usuario.id).catch(() => {});
  revalidatePath("/grr", "layout");
  return { ok: "Plano ajustado e reenviado à diretoria." };
}

/** evidência de execução ou comentário no histórico do plano */
export async function registrarNoPlanoAcao(_e: EstadoPlano, f: FormData): Promise<EstadoPlano> {
  const usuario = await exigirPerfil([...PERFIS]);
  const id = texto(f, "id");
  const tipo = texto(f, "tipo") === "evidencia" ? "evidencia" : "comentario";
  const conteudo = texto(f, "texto", 2000);
  if (!ehId(id) || !conteudo) return { erro: "Escreva o que registrar." };
  if (!(await lerPlano(id))) return { erro: "Plano não encontrado." };
  const { error } = await criarClienteServidor().from("grr_acao_eventos").insert({ acao_id: id, tipo, texto: conteudo, criado_por: usuario.id });
  if (error) return { erro: erroDoBanco(error.message) };
  revalidatePath(`/grr/planos/${id}`);
  return { ok: tipo === "evidencia" ? "Evidência registrada." : "Comentário registrado." };
}

