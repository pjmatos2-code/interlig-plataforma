import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ehAgenteCrm, ROTULO_ORIGEM, type CategoriaOrigem, type Perfil } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/**
 * Exportação do CRM com filtros (26/09/2026): situação (abertos, vendidas,
 * perdidas ou tudo), etapa do funil, vendedora e intervalo de datas.
 * Planilha CSV que abre direto no Excel (BOM + ponto e vírgula). A RLS
 * recorta pelo perfil: gestor tudo, coordenador o time/POP, agente só o dela.
 *
 * Datas: abertos/todos filtram pela CRIAÇÃO do ticket; vendidas e perdidas,
 * pela data de FECHAMENTO (é a régua do contato posterior).
 */
const ETAPA_ROTULO: Record<string, string> = {
  pre_cadastro: "Pré-Cadastro",
  novo: "Sem contato",
  em_atendimento: "Contato inicial",
  proposta: "Interessado (antigo)",
  aguardando: "Criação do contrato",
};

export async function GET(req: Request) {
  const usuario = await exigirUsuario();
  if (
    !["gestor", "supervisor", "direcao"].includes(usuario.perfil) &&
    !ehAgenteCrm(usuario.perfil as Perfil)
  )
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const hoje = new Date().toISOString().slice(0, 10);
  const valida = (v: string | null) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v! : null);
  const de = valida(searchParams.get("de")) ?? `${hoje.slice(0, 7)}-01`;
  const ate = valida(searchParams.get("ate")) ?? hoje;
  const situacao = ["abertos", "convertido", "nao_convertido", "todos"].includes(
    searchParams.get("situacao") ?? ""
  )
    ? searchParams.get("situacao")!
    : "todos";
  const etapa = Object.keys(ETAPA_ROTULO).includes(searchParams.get("etapa") ?? "")
    ? searchParams.get("etapa")!
    : null;
  const vendedor = /^[0-9a-f-]{36}$/.test(searchParams.get("vendedor") ?? "")
    ? searchParams.get("vendedor")!
    : null;

  const supabase = criarClienteServidor();
  let q = supabase
    .from("tickets")
    .select(
      `cliente_nome, telefone, cpf, email, etapa, desfecho, valor_estimado, origem_cadastro,
       origem_criacao, criado_em, fechado_em, etapa_encerramento, resumo_tratativa,
       proxima_abordagem, score, score_faixa,
       vendedores(nome), pops(nome), motivos_nao_conversao(nome), planos(nome)`
    )
    .limit(5000);

  if (situacao === "abertos") {
    q = q.neq("etapa", "fechado").gte("criado_em", `${de}T00:00:00`).lte("criado_em", `${ate}T23:59:59`);
    if (etapa) q = q.eq("etapa", etapa);
  } else if (situacao === "convertido" || situacao === "nao_convertido") {
    q = q
      .eq("etapa", "fechado")
      .eq("desfecho", situacao)
      .gte("fechado_em", `${de}T00:00:00`)
      .lte("fechado_em", `${ate}T23:59:59`)
      .order("fechado_em", { ascending: false });
    if (etapa) q = q.eq("etapa_encerramento", etapa);
  } else {
    q = q.gte("criado_em", `${de}T00:00:00`).lte("criado_em", `${ate}T23:59:59`);
    if (etapa) q = q.or(`etapa.eq.${etapa},etapa_encerramento.eq.${etapa}`);
  }
  if (vendedor) q = q.eq("vendedor_id", vendedor);
  q = q.order("criado_em", { ascending: false });

  const { data: tickets, error } = await q;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const dataBr = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("pt-BR", {
          timeZone: "America/Santarem",
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        })
      : "";
  const campo = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

  const cab = [
    "Cliente", "Telefone", "CPF", "E-mail", "Cidade (POP)", "Vendedora",
    "Situação", "Etapa", "Motivo da não conversão", "Plano", "Valor (R$)",
    "Score", "Faixa", "Origem", "Fonte do ticket", "Criado em", "Fechado em",
    "Resumo da tratativa", "Próxima abordagem",
  ];
  type Linha = Record<string, unknown> & {
    vendedores: { nome: string } | null;
    pops: { nome: string } | null;
    motivos_nao_conversao: { nome: string } | null;
    planos: { nome: string } | null;
  };
  const linhas = ((tickets ?? []) as unknown as Linha[]).map((t) => {
    const fechado = t.etapa === "fechado";
    const situacaoTexto = !fechado
      ? "Em aberto"
      : t.desfecho === "convertido"
        ? "Vendida"
        : "Perdida";
    const etapaTexto = fechado
      ? t.desfecho === "convertido"
        ? "Contrato assinado"
        : ETAPA_ROTULO[t.etapa_encerramento as string] ?? "Não convertido"
      : ETAPA_ROTULO[t.etapa as string] ?? String(t.etapa);
    return [
      campo(t.cliente_nome),
      campo(t.telefone),
      campo(t.cpf),
      campo(t.email),
      campo(t.pops?.nome),
      campo(t.vendedores?.nome),
      campo(situacaoTexto),
      campo(etapaTexto),
      campo(t.motivos_nao_conversao?.nome),
      campo(t.planos?.nome),
      campo(t.valor_estimado != null ? Number(t.valor_estimado).toFixed(2).replace(".", ",") : ""),
      campo(t.score ?? ""),
      campo(t.score_faixa ?? ""),
      campo(ROTULO_ORIGEM[t.origem_cadastro as CategoriaOrigem] ?? t.origem_cadastro ?? ""),
      campo(
        t.origem_criacao === "sz_auto" ? "WhatsApp / SZ Chat" : t.origem_criacao === "site" ? "Site" : "Manual"
      ),
      campo(dataBr(t.criado_em as string)),
      campo(dataBr(t.fechado_em as string)),
      campo(t.resumo_tratativa),
      campo(t.proxima_abordagem),
    ].join(";");
  });

  const csv = "﻿" + "sep=;\n" + cab.map(campo).join(";") + "\n" + linhas.join("\n") + "\n";
  const nome = `crm-${situacao}-${de}-a-${ate}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
