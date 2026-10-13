import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { FORA_DA_BASE, filaDebito, filaInsatisfacao, pedidosCancelamento, ROTULO_RESULTADO, type UltimoContato } from "@/lib/prevencao/dados";
import { cancelamentosPeriodo, indicadoresPorContrato } from "@/lib/prevencao/exportar";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Planilha da Prevenção de cancelamento (pedido do gestor, 13/10/2026):
 * resumo + uma aba por fila, com nome, IDs, telefone, quantos pedidos de
 * cancelamento o cliente já fez, boletos em atraso e motivo. Mesmos filtros
 * da tela (unidade, CNPJ/corporativos) e mesmas exclusões (rede neutra,
 * permutas, órgãos públicos, contratos internos).
 */

const UNIDADES = ["Altamira", "Vitória do Xingu", "Brasil Novo"];
const AZUL = "FF043792";
const MOEDA = '"R$" #,##0.00';

const dataIso = (iso: string | null | undefined) => {
  if (!iso) return null;
  const s = iso.length <= 10 ? `${iso}T12:00:00-03:00` : iso;
  const d = new Date(s);
  // o Excel não tem fuso: grava a hora de Santarém como hora "local"
  return isNaN(d.getTime()) ? null : new Date(d.getTime() - 3 * 3600_000);
};
const contato = (c: UltimoContato | null) =>
  c ? { resultado: ROTULO_RESULTADO[c.resultado], em: dataIso(c.em), por: c.por, obs: c.observacao } : { resultado: "Sem contato", em: null, por: null, obs: null };
const SITUACAO_ANTERIOR: Record<string, string> = {
  Ativo: "Ativo — pediu para sair",
  Suspenso: "Suspenso — débito",
  Inativo: "Não instalou",
  Novo: "Não instalou",
};

type Coluna = { titulo: string; chave: string; largura: number; formato?: string };

function aba(wb: ExcelJS.Workbook, nome: string, colunas: Coluna[], linhas: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(nome, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = colunas.map((c) => ({ header: c.titulo, key: c.chave, width: c.largura, style: c.formato ? { numFmt: c.formato } : {} }));
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  cab.alignment = { vertical: "middle", wrapText: true };
  cab.height = 32;
  for (const l of linhas) ws.addRow(l);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  return ws;
}

export async function GET(req: Request) {
  const usuario = await exigirUsuario();
  if (!["gestor", "direcao", "agente_retencao", "agente_atendimento", "supervisor"].includes(usuario.perfil))
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  let unidade = UNIDADES.includes(searchParams.get("unidade") ?? "") ? searchParams.get("unidade")! : null;
  if (usuario.perfil === "supervisor") {
    const { data: pop } = usuario.pop_id
      ? await criarClienteAdmin().from("pops").select("nome").eq("id", usuario.pop_id).maybeSingle()
      : { data: null };
    const nome = String(pop?.nome ?? "");
    if (!["Brasil Novo", "Vitória do Xingu"].includes(nome)) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    unidade = nome;
  }
  const corporativo = searchParams.get("segmento") === "corporativo";
  const agora = new Date(Date.now() - 3 * 3600_000);
  const mesAtual = agora.toISOString().slice(0, 7);
  const mesValido = (v: string | null) => (/^\d{4}-\d{2}$/.test(v ?? "") ? v! : null);
  const ateMes = mesValido(searchParams.get("ate")) ?? mesAtual;
  const deMes =
    mesValido(searchParams.get("de")) ??
    new Date(Date.UTC(Number(ateMes.slice(0, 4)), Number(ateMes.slice(5, 7)) - 3, 1)).toISOString().slice(0, 7);
  const [aA, mA] = ateMes.split("-").map(Number);
  const fimPeriodo = new Date(Date.UTC(aA, mA, 0)).toISOString().slice(0, 10);

  const filtra = <T extends { pop: string | null; corporativo: boolean }>(l: T[]) =>
    l.filter((x) => (!unidade || x.pop === unidade) && (!corporativo || x.corporativo));

  const [debito, insatisfacao, pedidosBrutos, cancelBrutos] = await Promise.all([
    filaDebito(),
    filaInsatisfacao(),
    pedidosCancelamento(`${deMes}-01`, `${ateMes}-01`),
    cancelamentosPeriodo(`${deMes}-01`, fimPeriodo),
  ]);
  const fila = filtra(debito);
  const insat = filtra(insatisfacao);
  const pedidos = filtra(pedidosBrutos);
  const cancelados = filtra(cancelBrutos).filter((c) => !FORA_DA_BASE.test(`${c.cliente} ${c.plano ?? ""}`));
  const ind = await indicadoresPorContrato([
    ...fila.map((x) => x.sgpContratoId),
    ...insat.map((x) => x.sgpContratoId),
    ...pedidos.map((x) => x.sgpContratoId),
    ...cancelados.map((x) => x.sgpContratoId),
  ]);
  const I = (id: string) => ind.get(id) ?? { pedidosCancelamento12m: 0, retencoes12m: 0, ultimoPedido: null, boletosAtraso: 0, valorAtraso: 0, diasAtraso: 0 };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Interlig · Plataforma de Inteligência Comercial";
  wb.created = new Date();

  // ---------------- Resumo
  const nomeMes = (m: string) => `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
  const periodo = deMes === ateMes ? nomeMes(deMes) : `${nomeMes(deMes)} a ${nomeMes(ateMes)}`;
  const faixa = (de: number, ate: number) => fila.filter((x) => x.diasAtraso >= de && x.diasAtraso <= ate);
  const semContato = (c: UltimoContato | null) => !c || Date.now() - Date.parse(c.em) > 7 * 86_400_000;
  const passaram = pedidos.filter((p) => p.passouRetencao).length;
  const motivosVol = new Map<string, number>();
  for (const c of cancelados.filter((x) => x.situacaoAnterior === "Ativo")) {
    const k = c.motivo ?? "Sem motivo";
    motivosVol.set(k, (motivosVol.get(k) ?? 0) + 1);
  }
  const res = wb.addWorksheet("Resumo");
  res.columns = [{ width: 46 }, { width: 22 }, { width: 22 }];
  res.addRow(["Prevenção de cancelamento — Interlig"]).font = { bold: true, size: 15, color: { argb: AZUL } };
  res.addRow([`Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Santarem" })} por ${usuario.nome}`]).font = { color: { argb: "FF5B6577" } };
  res.addRow([`Unidade: ${unidade ?? "todas"} · Clientes: ${corporativo ? "só CNPJ e corporativos" : "todos"} · Pedidos e cancelamentos: ${periodo}`]).font = { color: { argb: "FF5B6577" } };
  res.addRow(["Fora da base: rede neutra, permutas, órgãos públicos e contratos internos/isentos."]).font = { italic: true, color: { argb: "FF5B6577" } };
  const bloco = (titulo: string, itens: [string, number | string, string?][]) => {
    res.addRow([]);
    const r = res.addRow([titulo]);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    for (const [rot, v, fmt] of itens) {
      const linha = res.addRow([rot, v]);
      if (fmt) linha.getCell(2).numFmt = fmt;
      linha.getCell(2).font = { bold: true };
    }
  };
  bloco("Débito — boleto vencido há mais de 15 dias (hoje)", [
    ["Clientes na fila", fila.length],
    ["Mensalidade em risco (R$/mês)", fila.reduce((s, x) => s + x.valor, 0), MOEDA],
    ["Boletos vencidos", fila.reduce((s, x) => s + x.boletos, 0)],
    ["Valor em aberto", fila.reduce((s, x) => s + x.valorAberto, 0), MOEDA],
    ["Sem contato nos últimos 7 dias", fila.filter((x) => semContato(x.contato)).length],
    ["Atraso de 16 a 30 dias", faixa(16, 30).length],
    ["Atraso de 31 a 60 dias", faixa(31, 60).length],
    ["Atraso de 61 a 90 dias", faixa(61, 90).length],
    ["Atraso acima de 90 dias", faixa(91, 99_999).length],
  ]);
  bloco(`Pedidos de cancelamento — ${periodo}`, [
    ["Pedidos de cancelamento", pedidos.length],
    ["Passaram pela retenção", passaram],
    ["% que passou pela retenção", pedidos.length ? passaram / pedidos.length : 0, "0%"],
    ["Ficaram (sem cancelamento 7 dias depois)", pedidos.filter((p) => p.situacao === "ficou").length],
    ["Cancelados", pedidos.filter((p) => p.situacao === "cancelado").length],
    ["Cancelados sem passar pela retenção", pedidos.filter((p) => p.situacao === "cancelado" && !p.passouRetencao).length],
  ]);
  bloco("Insatisfação — 2+ chamados de suporte em 30 dias (hoje)", [
    ["Clientes com 2 ou mais chamados", insat.length],
    ["Clientes com 3 ou mais chamados", insat.filter((x) => x.chamados >= 3).length],
  ]);
  bloco(`Cancelamentos — ${periodo}`, [
    ["Voluntários (estava ativo e pediu para sair)", cancelados.filter((c) => c.situacaoAnterior === "Ativo").length],
    ["Por débito (estava suspenso)", cancelados.filter((c) => c.situacaoAnterior === "Suspenso").length],
    ["Não chegou a instalar", cancelados.filter((c) => c.situacaoAnterior === "Inativo" || c.situacaoAnterior === "Novo").length],
    ...[...motivosVol].sort((a, b) => b[1] - a[1]).map(([k, v]) => [`   Motivo (voluntários): ${k}`, v] as [string, number]),
  ]);

  // ---------------- Débito
  const colCliente: Coluna[] = [
    { titulo: "ID contrato (SGP)", chave: "contrato", largura: 12 },
    { titulo: "ID cliente (SGP)", chave: "clienteId", largura: 12 },
    { titulo: "Cliente", chave: "cliente", largura: 36 },
    { titulo: "Telefone", chave: "telefone", largura: 16 },
    { titulo: "Unidade", chave: "pop", largura: 16 },
    { titulo: "Plano", chave: "plano", largura: 30 },
    { titulo: "CNPJ / corporativo", chave: "corp", largura: 11 },
    { titulo: "Mensalidade", chave: "valor", largura: 13, formato: MOEDA },
  ];
  const colIndicadores: Coluna[] = [
    { titulo: "Pedidos de cancelamento (12 meses)", chave: "pedidos12", largura: 14 },
    { titulo: "Último pedido de cancelamento", chave: "ultimoPedido", largura: 16, formato: "dd/mm/yyyy" },
    { titulo: "Retenções registradas no SGP (12 meses)", chave: "ret12", largura: 14 },
  ];
  const colContato: Coluna[] = [
    { titulo: "Último contato (prevenção)", chave: "contato", largura: 22 },
    { titulo: "Data do contato", chave: "contatoEm", largura: 16, formato: "dd/mm/yyyy hh:mm" },
    { titulo: "Registrado por", chave: "contatoPor", largura: 18 },
    { titulo: "Observação do contato", chave: "contatoObs", largura: 36 },
  ];
  const baseCliente = (x: { sgpContratoId: string; sgpClienteId: string | null; cliente: string; telefone: string | null; pop: string | null; plano: string | null; corporativo: boolean; valor: number }) => ({
    contrato: Number(x.sgpContratoId) || x.sgpContratoId,
    clienteId: x.sgpClienteId ? Number(x.sgpClienteId) || x.sgpClienteId : null,
    cliente: x.cliente,
    telefone: x.telefone,
    pop: x.pop,
    plano: x.plano,
    corp: x.corporativo ? "Sim" : "Não",
    valor: x.valor,
  });
  const baseInd = (id: string) => {
    const v = I(id);
    return { pedidos12: v.pedidosCancelamento12m, ultimoPedido: dataIso(v.ultimoPedido), ret12: v.retencoes12m };
  };
  const baseContato = (c: UltimoContato | null) => {
    const k = contato(c);
    return { contato: k.resultado, contatoEm: k.em, contatoPor: k.por, contatoObs: k.obs };
  };

  aba(
    wb,
    "Débito",
    [
      ...colCliente,
      { titulo: "Situação", chave: "situacao", largura: 11 },
      { titulo: "Boletos em atraso", chave: "boletos", largura: 10 },
      { titulo: "Valor em aberto", chave: "aberto", largura: 13, formato: MOEDA },
      { titulo: "Dias de atraso", chave: "dias", largura: 9 },
      { titulo: "Vencimento mais antigo", chave: "venc", largura: 13, formato: "dd/mm/yyyy" },
      { titulo: "Prometeu pagar pela URA em", chave: "promessa", largura: 14, formato: "dd/mm/yyyy" },
      { titulo: "Chamados de suporte (90 dias)", chave: "sup", largura: 11 },
      ...colIndicadores,
      ...colContato,
    ],
    [...fila]
      .sort((a, b) => b.valor - a.valor || b.diasAtraso - a.diasAtraso)
      .map((x) => ({
        ...baseCliente(x),
        situacao: x.status === "suspenso" ? "Suspenso" : "Ativo",
        boletos: x.boletos,
        aberto: x.valorAberto,
        dias: x.diasAtraso,
        venc: dataIso(x.vencimentoAntigo),
        promessa: dataIso(x.ultimaPromessa),
        sup: x.suporte90d,
        ...baseInd(x.sgpContratoId),
        ...baseContato(x.contato),
      }))
  );

  // ---------------- Pedidos de cancelamento
  const SITUACAO_PEDIDO = { cancelado: "Cancelado", ficou: "Ficou", aguardando: "Aguardando (menos de 7 dias)" };
  aba(
    wb,
    "Pedidos de cancelamento",
    [
      { titulo: "Data do pedido", chave: "pedidoEm", largura: 16, formato: "dd/mm/yyyy hh:mm" },
      ...colCliente,
      { titulo: "Registrado no SGP por", chave: "atendente", largura: 18 },
      { titulo: "Passou pela retenção", chave: "retencao", largura: 11 },
      { titulo: "Desfecho na Retenção", chave: "desfecho", largura: 14 },
      { titulo: "Situação", chave: "situacao", largura: 16 },
      { titulo: "Data do cancelamento", chave: "canceladoEm", largura: 13, formato: "dd/mm/yyyy" },
      { titulo: "Motivo do cancelamento", chave: "motivo", largura: 30 },
      { titulo: "Boletos em atraso (hoje)", chave: "boletos", largura: 10 },
      { titulo: "Valor em atraso (hoje)", chave: "atraso", largura: 13, formato: MOEDA },
      ...colIndicadores,
    ],
    pedidos.map((p) => ({
      pedidoEm: dataIso(p.pedidoEm),
      ...baseCliente(p),
      atendente: p.atendente,
      retencao: p.passouRetencao ? "Sim" : "Não",
      desfecho: p.desfechoRetencao,
      situacao: SITUACAO_PEDIDO[p.situacao],
      canceladoEm: dataIso(p.canceladoEm),
      motivo: (p.motivo ?? "").replace(/^Cancelamento - /, "") || null,
      boletos: I(p.sgpContratoId).boletosAtraso,
      atraso: I(p.sgpContratoId).valorAtraso,
      ...baseInd(p.sgpContratoId),
    }))
  );

  // ---------------- Insatisfação
  aba(
    wb,
    "Insatisfação",
    [
      ...colCliente,
      { titulo: "Cliente desde", chave: "desde", largura: 13, formato: "dd/mm/yyyy" },
      { titulo: "Chamados de suporte (30 dias)", chave: "chamados", largura: 11 },
      { titulo: "Tipos de chamado", chave: "tipos", largura: 44 },
      { titulo: "Último chamado", chave: "ultimo", largura: 16, formato: "dd/mm/yyyy hh:mm" },
      { titulo: "Boletos em atraso (hoje)", chave: "boletos", largura: 10 },
      ...colIndicadores,
      ...colContato,
    ],
    insat.map((x) => {
      const tipos = new Map<string, number>();
      for (const t of x.tipos) tipos.set(t.replace(/^Suporte - /, ""), (tipos.get(t.replace(/^Suporte - /, "")) ?? 0) + 1);
      return {
        ...baseCliente(x),
        desde: dataIso(x.ativacao),
        chamados: x.chamados,
        tipos: [...tipos].map(([t, q]) => (q > 1 ? `${t} (${q}x)` : t)).join(", "),
        ultimo: dataIso(x.ultimo),
        boletos: I(x.sgpContratoId).boletosAtraso,
        ...baseInd(x.sgpContratoId),
        ...baseContato(x.contato),
      };
    })
  );

  // ---------------- Cancelamentos
  aba(
    wb,
    "Cancelamentos",
    [
      { titulo: "Data do cancelamento", chave: "data", largura: 13, formato: "dd/mm/yyyy" },
      ...colCliente,
      { titulo: "Situação antes de cancelar", chave: "antes", largura: 22 },
      { titulo: "Motivo", chave: "motivo", largura: 30 },
      { titulo: "Cancelado no SGP por", chave: "usuario", largura: 18 },
      { titulo: "Boletos em atraso (hoje)", chave: "boletos", largura: 10 },
      { titulo: "Valor em atraso (hoje)", chave: "atraso", largura: 13, formato: MOEDA },
      ...colIndicadores,
    ],
    cancelados.map((c) => ({
      data: dataIso(c.data),
      ...baseCliente(c),
      antes: SITUACAO_ANTERIOR[c.situacaoAnterior ?? ""] ?? c.situacaoAnterior,
      motivo: c.motivo ?? "Sem motivo",
      usuario: c.usuario,
      boletos: I(c.sgpContratoId).boletosAtraso,
      atraso: I(c.sgpContratoId).valorAtraso,
      ...baseInd(c.sgpContratoId),
    }))
  );

  const buffer = await wb.xlsx.writeBuffer();
  const sufixo = [unidade?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-"), corporativo ? "corporativos" : null]
    .filter(Boolean)
    .join("-");
  const nomeArquivo = `prevencao-cancelamento-${agora.toISOString().slice(0, 10)}${sufixo ? `-${sufixo}` : ""}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
