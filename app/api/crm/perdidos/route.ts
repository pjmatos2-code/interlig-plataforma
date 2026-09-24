import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ehAgenteCrm, ROTULO_ORIGEM, type CategoriaOrigem, type Perfil } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/**
 * Exportação dos perdidos (24/09/2026): planilha CSV com tudo que a equipe
 * precisa para o contato posterior. Abre direto no Excel (BOM + ponto e
 * vírgula). A RLS recorta pelo perfil: gestor tudo, coordenador o time/POP.
 */
export async function GET(req: Request) {
  const usuario = await exigirUsuario();
  if (
    !["gestor", "supervisor", "direcao"].includes(usuario.perfil) &&
    !ehAgenteCrm(usuario.perfil as Perfil)
  )
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const hoje = new Date().toISOString().slice(0, 10);
  const de = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("de") ?? "")
    ? searchParams.get("de")!
    : `${hoje.slice(0, 7)}-01`;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("ate") ?? "")
    ? searchParams.get("ate")!
    : hoje;

  const supabase = criarClienteServidor();
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select(
      `cliente_nome, telefone, cpf, email, valor_estimado, origem_cadastro, origem_criacao,
       criado_em, fechado_em, etapa_encerramento, resumo_tratativa, proxima_abordagem,
       vendedores(nome), pops(nome), motivos_nao_conversao(nome), planos(nome)`
    )
    .eq("etapa", "fechado")
    .eq("desfecho", "nao_convertido")
    .gte("fechado_em", `${de}T00:00:00`)
    .lte("fechado_em", `${ate}T23:59:59`)
    .order("fechado_em", { ascending: false })
    .limit(5000);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const ETAPA: Record<string, string> = {
    pre_cadastro: "Pré-Cadastro",
    novo: "Sem contato",
    em_atendimento: "Contato inicial",
    proposta: "Interessado (antigo)",
    aguardando: "Criação do contrato",
  };
  const dataBr = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("pt-BR", {
          timeZone: "America/Santarem",
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        })
      : "";
  // campo CSV: aspas duplicadas; ; e quebras de linha ficam protegidos
  const campo = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

  const cab = [
    "Cliente", "Telefone", "CPF", "E-mail", "Cidade (POP)", "Vendedora",
    "Motivo da não conversão", "Plano de interesse", "Valor estimado (R$)",
    "Origem", "Fonte do ticket", "Criado em", "Fechado em",
    "Etapa em que parou", "Resumo da tratativa", "Próxima abordagem",
  ];
  type Linha = Record<string, unknown> & {
    vendedores: { nome: string } | null;
    pops: { nome: string } | null;
    motivos_nao_conversao: { nome: string } | null;
    planos: { nome: string } | null;
  };
  const linhas = ((tickets ?? []) as unknown as Linha[]).map((t) =>
    [
      campo(t.cliente_nome),
      campo(t.telefone),
      campo(t.cpf),
      campo(t.email),
      campo(t.pops?.nome),
      campo(t.vendedores?.nome),
      campo(t.motivos_nao_conversao?.nome),
      campo(t.planos?.nome),
      campo(
        t.valor_estimado != null ? Number(t.valor_estimado).toFixed(2).replace(".", ",") : ""
      ),
      campo(ROTULO_ORIGEM[t.origem_cadastro as CategoriaOrigem] ?? t.origem_cadastro),
      campo(
        t.origem_criacao === "sz_auto" ? "WhatsApp / SZ Chat" : t.origem_criacao === "site" ? "Site" : "Manual"
      ),
      campo(dataBr(t.criado_em as string)),
      campo(dataBr(t.fechado_em as string)),
      campo(ETAPA[t.etapa_encerramento as string] ?? ""),
      campo(t.resumo_tratativa),
      campo(t.proxima_abordagem),
    ].join(";")
  );

  // BOM + sep=; → Excel pt-BR abre com colunas certas e acentos intactos
  const csv = "﻿" + "sep=;\n" + cab.map(campo).join(";") + "\n" + linhas.join("\n") + "\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="perdidos-${de}-a-${ate}.csv"`,
    },
  });
}
