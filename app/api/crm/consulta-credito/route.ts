import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { extrairConsultCenter } from "@/lib/credito/consult-center";
import { ehAgenteCrm, type Perfil } from "@/lib/tipos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Upload + processamento da consulta Consult Center (fase MONITORAMENTO).
 *
 * A extração roda local (sem OCR/IA externa — o PDF tem dados pessoais) e o
 * resultado classifica, alerta e registra. NADA aqui bloqueia a venda: CPF
 * divergente, vínculo SGP pendente ou score não identificado viram alerta e
 * auditoria, nunca erro que impeça o andamento do ticket.
 */
export async function POST(req: Request) {
  const usuario = await exigirUsuario();
  if (!["gestor", "supervisor"].includes(usuario.perfil) && !ehAgenteCrm(usuario.perfil as Perfil))
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const ticketId = String(form?.get("ticket_id") ?? "");
  const arquivo = form?.get("arquivo");
  if (!ticketId || !(arquivo instanceof File))
    return NextResponse.json({ erro: "Envie o PDF da consulta." }, { status: 400 });
  if (arquivo.size > 10 * 1024 * 1024)
    return NextResponse.json({ erro: "PDF acima de 10MB." }, { status: 400 });

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-")
    return NextResponse.json({ erro: "O arquivo não é um PDF válido." }, { status: 400 });

  const admin = criarClienteAdmin();
  const { data: t } = await admin
    .from("tickets")
    .select("id, cpf, vendedor_id, cliente_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t) return NextResponse.json({ erro: "Ticket não encontrado." }, { status: 404 });

  // extração local
  let dados;
  try {
    dados = await extrairConsultCenter(bytes);
  } catch (e) {
    return NextResponse.json(
      { erro: `Não consegui ler o PDF: ${e instanceof Error ? e.message : String(e)}` },
      { status: 422 }
    );
  }

  // faixa pela régua Interlig (nunca pela cor do gráfico da Serasa);
  // score ausente NÃO é zero — fica sem faixa, com aviso de conferência
  let faixa: string | null = null;
  let adiantamento: number | null = null;
  if (dados.score !== null) {
    const { data: regua } = await admin
      .from("score_regua")
      .select("faixa, score_min, score_max, valor")
      .order("ordem");
    const f = (regua ?? []).find((r) => dados.score! >= r.score_min && dados.score! <= r.score_max);
    faixa = f?.faixa ?? null;
    adiantamento = f ? Number(f.valor) : null;
  }

  // credor conhecido: só match EXATO com nome/alias cadastrado
  const { data: credores } = await admin
    .from("credores_conhecidos")
    .select("nome, categoria, aliases");
  const provedores = new Set<string>();
  for (const c of credores ?? []) {
    if (c.categoria !== "Provedor de internet") continue;
    provedores.add(String(c.nome).toUpperCase());
    for (const a of (c.aliases as string[]) ?? []) provedores.add(a.toUpperCase());
  }
  const pendenciaProvedor = dados.ocorrencias.some(
    (o) => o.credor && provedores.has(o.credor.toUpperCase())
  );

  // validação do titular (CPF como string de 11 dígitos)
  const cpfTicket = (t.cpf ?? "").replace(/\D/g, "") || null;
  const cpfConfere = dados.cpf && cpfTicket ? dados.cpf === cpfTicket : null;

  // vínculo SGP: existe cliente com esse CPF?
  let sgpVinculo: string | null = null;
  if (dados.cpf) {
    const { data: cli } = await admin
      .from("clientes")
      .select("id, cpf")
      .eq("cpf", dados.cpf)
      .limit(1);
    sgpVinculo = (cli ?? []).length > 0 ? "compativel" : "pendente";
    if (cpfConfere === false) sgpVinculo = "divergente";
  }

  // arquivo no bucket PRIVADO — nome sem CPF, caminho por ticket
  const path = `${ticketId}/${crypto.randomUUID()}.pdf`;
  const { error: eUp } = await admin.storage
    .from("consultas-credito")
    .upload(path, bytes, { contentType: "application/pdf" });
  if (eUp) return NextResponse.json({ erro: `Falha ao guardar o PDF: ${eUp.message}` }, { status: 500 });

  // versão nova SEM apagar a anterior
  const { data: anteriores } = await admin
    .from("consultas_credito")
    .select("id, versao")
    .eq("ticket_id", ticketId)
    .order("versao", { ascending: false });
  const versao = ((anteriores ?? [])[0]?.versao ?? 0) + 1;
  if ((anteriores ?? []).length > 0)
    await admin.from("consultas_credito").update({ atual: false }).eq("ticket_id", ticketId);

  const { data: criada, error: eIns } = await admin
    .from("consultas_credito")
    .insert({
      ticket_id: ticketId,
      versao,
      atual: true,
      arquivo_path: path,
      nome_titular: dados.nomeTitular,
      cpf: dados.cpf,
      score: dados.score,
      faixa,
      adiantamento_valor: adiantamento,
      protocolo: dados.protocolo,
      consulta_em: dados.consultaEm,
      codigo_associado: dados.codigoAssociado,
      unidade_declarada: dados.unidadeDeclarada,
      pendencias_qtd: dados.pendenciasQtd,
      pendencias_valor: dados.pendenciasValor,
      pendencia_recente: dados.pendenciaRecente,
      ocorrencias: dados.ocorrencias,
      pendencia_provedor: pendenciaProvedor,
      cpf_confere: cpfConfere,
      sgp_vinculo: sgpVinculo,
      criado_por: usuario.id,
    })
    .select("id")
    .single();
  if (eIns) return NextResponse.json({ erro: eIns.message }, { status: 500 });

  // score do ticket: alimentado pela consulta (edição manual sai de cena).
  // Em DIVERGÊNCIA de titular NÃO tocamos no ticket — o score é de outro CPF
  // e o titular jamais é substituído automaticamente.
  if (dados.score !== null && cpfConfere !== false) {
    await admin
      .from("tickets")
      .update({
        score: dados.score,
        score_faixa: faixa,
        adiantamento_valor: adiantamento,
        score_origem: "consulta",
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", ticketId);
  }

  // histórico do ticket (auditoria: quem, quando, o quê)
  const alertas: string[] = [];
  if (pendenciaProvedor) alertas.push("pendência registrada com provedor de internet");
  if (cpfConfere === false) alertas.push("DIVERGÊNCIA DE TITULAR — CPF da consulta não corresponde ao do ticket");
  if (dados.score === null) alertas.push("score não identificado; consulta requer conferência");
  if (sgpVinculo === "pendente") alertas.push("vínculo SGP pendente");
  await admin.from("ticket_eventos").insert({
    ticket_id: ticketId,
    tipo: "nota",
    dados: {
      texto: `📄 Consulta Consult Center anexada (v${versao})${
        dados.score !== null ? ` — score ${dados.score} → faixa ${String(faixa ?? "?").toUpperCase()}` : " — score não identificado"
      }${adiantamento && adiantamento > 0 ? ` · adiantamento recomendado R$ ${adiantamento.toFixed(2).replace(".", ",")}` : ""}${
        dados.protocolo ? ` · protocolo ${dados.protocolo}` : ""
      }${alertas.length ? ` · alertas: ${alertas.join("; ")}` : ""}.`,
    },
    usuario_id: usuario.id,
  });

  return NextResponse.json({
    ok: true,
    consulta: {
      id: criada.id,
      versao,
      score: dados.score,
      faixa,
      adiantamentoValor: adiantamento,
      protocolo: dados.protocolo,
      consultaEm: dados.consultaEm,
      pendenciasQtd: dados.pendenciasQtd,
      pendenciasValor: dados.pendenciasValor,
      pendenciaProvedor,
      cpfConfere,
      sgpVinculo,
    },
  });
}
