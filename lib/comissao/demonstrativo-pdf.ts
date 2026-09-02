import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { SnapshotComissao } from "@/lib/comissao/snapshot";
import { codigoVerificacao } from "@/lib/comissao/snapshot";

/**
 * Demonstrativo de Comissão em PDF — o documento que o financeiro arquiva.
 *
 * Ele se explica sozinho: além do valor, traz a memória de cálculo, a lista
 * nominal dos contratos e cada exceção aplicada pela gestão (venda liberada à
 * mão, assinatura dispensada, débito não aplicado) com motivo e autor. O
 * código de verificação no rodapé deriva do conteúdo — muda se o fechamento
 * for refeito, o que permite conferir a validade do papel anos depois.
 */

const MARINHO = rgb(0.039, 0.086, 0.22); // #0A1638
const AZUL = rgb(0.016, 0.216, 0.573); // #043792
const CEU = rgb(0.016, 0.486, 0.867); // #047CDD
const CINZA = rgb(0.42, 0.45, 0.5);
const CINZA_CLARO = rgb(0.93, 0.94, 0.96);
const TEXTO = rgb(0.1, 0.12, 0.16);
const VERDE = rgb(0.11, 0.55, 0.32);

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 44;
const LARGURA = A4[0] - MARGEM * 2;

const moeda = (v: number) =>
  `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const mesBr = (iso: string) => {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const [a, m] = iso.slice(0, 7).split("-");
  return `${meses[Number(m) - 1]} de ${a}`;
};

/** pdf-lib usa WinAnsi: troca o que a fonte padrão não desenha. */
const limpar = (t: string) =>
  (t ?? "")
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

function cortar(texto: string, fonte: PDFFont, tamanho: number, largura: number) {
  let t = limpar(texto);
  if (fonte.widthOfTextAtSize(t, tamanho) <= largura) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(`${t}...`, tamanho) > largura) t = t.slice(0, -1);
  return `${t}...`;
}

export async function gerarDemonstrativoPdf(
  snap: SnapshotComissao,
  meta: { vendedorId: string; versao: number; pagoEm?: string | null }
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);

  doc.setTitle(`Demonstrativo de Comissão — ${snap.vendedora} — ${snap.competencia.slice(0, 7)}`);
  doc.setAuthor("Interlig Internet Fibra");
  doc.setSubject("Demonstrativo de comissão");
  doc.setProducer("Plataforma de Inteligência Comercial Interlig");

  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  try {
    const bytes = await readFile(path.join(process.cwd(), "public/marca/logo-fundo-escuro.png"));
    logo = await doc.embedPng(bytes);
  } catch {
    // sem logo o documento continua válido — só perde o brasão
  }

  // o Setor de Atendimento comissiona refidelização, não venda: os rótulos
  // mudam para o documento fazer sentido para quem o recebe
  const ehRefid = snap.tipo === "refidelizacao";
  const ehRet = snap.tipo === "retencao";
  const ehGer = snap.tipo === "gerencia";
  // snapshots comerciais antigos guardaram % em vez de fração — normaliza
  const atingFrac =
    snap.resultado.atingimentoPct > 4 ? snap.resultado.atingimentoPct / 100 : snap.resultado.atingimentoPct;
  const rotuloItem = ehRet ? "clientes retidos" : ehRefid ? "planos refidelizados" : "contratos considerados";
  const rotuloQtd = ehGer ? "Nível final (menor pilar)" : ehRet ? "Clientes retidos (validados no SGP)" : ehRefid ? "Planos refidelizados" : "Vendas liberadas para comissão";

  const codigo = codigoVerificacao(
    meta.vendedorId,
    snap.competencia,
    meta.versao,
    snap.resultado.total
  );

  let pagina = doc.addPage(A4);
  let y = 0;

  const rodape = (p: PDFPage) => {
    p.drawLine({
      start: { x: MARGEM, y: 62 },
      end: { x: A4[0] - MARGEM, y: 62 },
      thickness: 0.5,
      color: CINZA_CLARO,
    });
    p.drawText(limpar(`Código de verificação ${codigo}  ·  versão ${meta.versao}`), {
      x: MARGEM, y: 48, size: 7.5, font: negrito, color: CINZA,
    });
    p.drawText(
      limpar(
        `Emitido em ${dataBr(new Date().toISOString())} · fechamento ${dataBr(snap.fechadoEm)}${snap.fechadoPor ? ` por ${snap.fechadoPor}` : ""}`
      ),
      { x: MARGEM, y: 36, size: 7.5, font: regular, color: CINZA }
    );
    p.drawText("Interlig Internet Fibra · documento gerado pela Plataforma de Inteligência Comercial", {
      x: MARGEM, y: 24, size: 7, font: regular, color: CINZA,
    });
  };

  const novaPagina = () => {
    rodape(pagina);
    pagina = doc.addPage(A4);
    y = A4[1] - MARGEM;
    return pagina;
  };
  const garantir = (altura: number) => {
    if (y - altura < 80) novaPagina();
  };

  // ---------------- cabeçalho ----------------
  pagina.drawRectangle({ x: 0, y: A4[1] - 108, width: A4[0], height: 108, color: MARINHO });
  if (logo) {
    const w = 118;
    const h = (logo.height / logo.width) * w;
    pagina.drawImage(logo, { x: MARGEM, y: A4[1] - 34 - h, width: w, height: h });
  } else {
    pagina.drawText("INTERLIG", {
      x: MARGEM, y: A4[1] - 58, size: 22, font: negrito, color: rgb(1, 1, 1),
    });
  }
  const titulo = ehRefid ? "DEMONSTRATIVO DE COMISSÃO" : "DEMONSTRATIVO DE COMISSÃO";
  pagina.drawText(titulo, {
    x: A4[0] - MARGEM - negrito.widthOfTextAtSize(titulo, 13),
    y: A4[1] - 52, size: 13, font: negrito, color: rgb(1, 1, 1),
  });
  if (ehRet) {
    const subR = "Setor de Retencao";
    pagina.drawText(limpar(subR), {
      x: A4[0] - MARGEM - regular.widthOfTextAtSize(limpar(subR), 8.5),
      y: A4[1] - 84, size: 8.5, font: regular, color: rgb(0.72, 0.82, 0.94),
    });
  }
  if (ehRefid) {
    const sub = "Setor de Atendimento - Refidelizacao";
    pagina.drawText(limpar(sub), {
      x: A4[0] - MARGEM - regular.widthOfTextAtSize(limpar(sub), 8.5),
      y: A4[1] - 84, size: 8.5, font: regular, color: rgb(0.72, 0.82, 0.94),
    });
  }
  const comp = limpar(`Competência: ${mesBr(snap.competencia)}`);
  pagina.drawText(comp, {
    x: A4[0] - MARGEM - regular.widthOfTextAtSize(comp, 10),
    y: A4[1] - 70, size: 10, font: regular, color: rgb(0.72, 0.82, 0.94),
  });

  y = A4[1] - 138;

  // ---------------- identificação ----------------
  pagina.drawText(limpar(snap.vendedora.toUpperCase()), {
    x: MARGEM, y, size: 17, font: negrito, color: MARINHO,
  });
  y -= 16;
  if (snap.pop) {
    pagina.drawText(limpar(`POP ${snap.pop}`), { x: MARGEM, y, size: 9.5, font: regular, color: CINZA });
    y -= 12;
  }
  y -= 12;

  // ---------------- destaque do valor ----------------
  pagina.drawRectangle({
    x: MARGEM, y: y - 62, width: LARGURA, height: 62,
    color: rgb(0.965, 0.976, 0.996), borderColor: CEU, borderWidth: 1,
  });
  pagina.drawText("VALOR A RECEBER", {
    x: MARGEM + 16, y: y - 22, size: 8.5, font: negrito, color: CEU,
  });
  pagina.drawText(limpar(moeda(snap.resultado.total)), {
    x: MARGEM + 16, y: y - 50, size: 26, font: negrito, color: AZUL,
  });
  const faixa: string = snap.resultado.degrau
    ? `${snap.resultado.degrau.valor}${snap.resultado.degrau.tipo === "valor_por_venda" ? " R$/venda" : "% do valor contratado"}`
    : "abaixo da faixa mínima";
  const cadastradas = snap.resultado.vendasComissionaveis + snap.resultado.vendasPendentes;
  const infoDir = [
    ehRet || ehRefid
      ? `Atingimento: ${(atingFrac * 100).toFixed(1).replace(".", ",")}%`
      : `Atingimento: ${cadastradas} cadastradas / ${snap.resultado.metaEfetiva} = ${(atingFrac * 100).toFixed(1).replace(".", ",")}%`,
    ...(ehRet || ehRefid
      ? []
      : [`(${snap.resultado.vendasComissionaveis} liberadas + ${snap.resultado.vendasPendentes} pendentes — só a liberada recebe)`]),
    `Faixa aplicada: ${faixa}`,
    `${ehRet ? "Retidos" : ehRefid ? "Planos" : "Vendas liberadas"}: ${snap.resultado.vendasComissionaveis}`,
  ];
  infoDir.forEach((linha, i) => {
    const t = limpar(linha);
    pagina.drawText(t, {
      x: A4[0] - MARGEM - 16 - regular.widthOfTextAtSize(t, 9),
      y: y - 22 - i * 13, size: 9, font: regular, color: TEXTO,
    });
  });
  y -= 84;

  // ---------------- memória de cálculo ----------------
  const secao = (titulo: string) => {
    garantir(40);
    pagina.drawText(limpar(titulo.toUpperCase()), {
      x: MARGEM, y, size: 9, font: negrito, color: AZUL,
    });
    y -= 6;
    pagina.drawLine({
      start: { x: MARGEM, y }, end: { x: A4[0] - MARGEM, y },
      thickness: 0.8, color: CEU,
    });
    y -= 16;
  };

  const linhaValor = (rotulo: string, valor: string, destaque = false) => {
    garantir(16);
    pagina.drawText(limpar(rotulo), {
      x: MARGEM, y, size: 9.5, font: destaque ? negrito : regular, color: destaque ? MARINHO : TEXTO,
    });
    const t = limpar(valor);
    pagina.drawText(t, {
      x: A4[0] - MARGEM - (destaque ? negrito : regular).widthOfTextAtSize(t, 9.5),
      y, size: 9.5, font: destaque ? negrito : regular, color: destaque ? MARINHO : TEXTO,
    });
    y -= 15;
  };

  secao("Memória de cálculo");
  if (ehGer) {
    linhaValor("Escada de níveis", "N1 1,5% · N2 2,0% · N3 2,5% · N4 3,0% — trava pelo MENOR pilar");
  } else {
    linhaValor(ehRet ? "Casos elegíveis no mês" : "Meta do mês", String(snap.meta));
  }
  if (snap.debito.aplicado && snap.debito.quantidade > 0) {
    linhaValor(
      snap.debito.janela
        ? `Débito early churn (vencimentos de ${dataBr(snap.debito.janela.de)} a ${dataBr(snap.debito.janela.ate)})`
        : `Débito de clientes não ativos (vendas de ${mesBr(snap.debito.coorte)})`,
      `+${snap.debito.quantidade}`
    );
    linhaValor("Meta efetiva", String(snap.resultado.metaEfetiva), true);
  } else if (!snap.debito.aplicado) {
    linhaValor(
      snap.debito.janela
        ? `Débito early churn (${dataBr(snap.debito.janela.de)}–${dataBr(snap.debito.janela.ate)})`
        : `Débito de inadimplentes (${mesBr(snap.debito.coorte)})`,
      "não aplicado nesta competência"
    );
  }
  if (ehGer && snap.gerencia) {
    const g = snap.gerencia;
    for (const pl of g.pilares) {
      linhaValor(
        `Pilar ${pl.rotulo}`,
        pl.atingimentoPct !== null
          ? `${pl.volume} / ${pl.meta} (${pl.atingimentoPct.toFixed(1).replace(".", ",")}%) - N${pl.nivel}`
          : `${pl.volume} retenções válidas - N${pl.nivel}`
      );
    }
    linhaValor("Nível final (menor pilar)", `N${g.nivelFinal} - ${g.nomeNivel}${g.pilarLimitante ? ` (limitante: ${g.pilarLimitante})` : ""}`, true);
    linhaValor("VTV Vendas Novas", moeda(g.base.vtvVendas));
    linhaValor("VTV Refidelização", moeda(g.base.vtvRefi));
    linhaValor("VTV Retido", moeda(g.base.vtvRetido));
    linhaValor("LIGCHIP (compõe valor, fora do volume)", moeda(g.base.vtvLigchip));
    linhaValor("Base global", moeda(g.base.total), true);
    linhaValor("Override aplicado", `${g.overridePct.toFixed(1).replace(".", ",")}%`, true);
    linhaValor(
      "Flags da competência",
      `early churn ${g.flags.earlyChurn ? "ON" : "OFF"} · clawback ${g.flags.clawback ? "ON" : "OFF"}${snap.debito.observacao ? ` (${snap.debito.observacao})` : ""}`
    );
  } else {
    linhaValor(rotuloQtd, String(snap.resultado.vendasComissionaveis));
  }
  if (ehRet)
    linhaValor("Taxa de retenção (irreversíveis fora)", `${(atingFrac * 100).toFixed(0).replace(".", ",")}%`);
  if (snap.resultado.estornos > 0)
    linhaValor(
      ehRet ? "Clawback (cancelou em até 30 dias)" : ehRefid ? "Aditivos reprovados pela gestão" : "Estornos (cancelamento precoce)",
      `-${snap.resultado.estornos}`
    );
  if (snap.resultado.vendasPendentes > 0)
    linhaValor(
      ehRet ? "Em risco (suspensos — pagam se reativarem)" : ehRefid ? "Aditivos sem as duas assinaturas (não pagos aqui)" : "Vendas ainda pendentes (não pagas aqui)",
      String(snap.resultado.vendasPendentes)
    );
  y -= 4;
  if (ehRefid || ehRet) {
    const vtv = snap.contratos.reduce((t, c) => t + c.valor, 0);
    linhaValor(ehRet ? "VTV dos clientes retidos (valor mensal)" : "VTV dos planos refidelizados (valor mensal)", moeda(vtv));
    linhaValor(`Comissão aplicada (${faixa})`, moeda(snap.resultado.valorBase));
  } else {
    linhaValor("Base de cálculo", moeda(snap.resultado.valorBase));
  }
  if (snap.resultado.bonusFixo > 0) linhaValor("Bônus fixo", moeda(snap.resultado.bonusFixo));
  for (const g of snap.resultado.gatilhos) linhaValor(g.descricao, moeda(g.adicional));
  y -= 2;
  garantir(24);
  pagina.drawLine({
    start: { x: MARGEM, y: y + 8 }, end: { x: A4[0] - MARGEM, y: y + 8 },
    thickness: 0.5, color: CINZA_CLARO,
  });
  linhaValor("TOTAL A RECEBER", moeda(snap.resultado.total), true);
  y -= 10;

  // ---------------- anexo I: contratos ----------------
  if (!ehGer) {
  secao(`Anexo I — ${rotuloItem} (${snap.contratos.length})`);
  const cols = [MARGEM, MARGEM + 52, MARGEM + 232, MARGEM + 392, A4[0] - MARGEM];
  const cabTabela = () => {
    garantir(22);
    pagina.drawRectangle({
      x: MARGEM, y: y - 4, width: LARGURA, height: 16, color: CINZA_CLARO,
    });
    const titulos = ["Contrato", "Cliente", "Plano", "Valor"];
    titulos.forEach((t, i) => {
      if (i === 3) {
        pagina.drawText(t, {
          x: cols[4] - 6 - negrito.widthOfTextAtSize(t, 7.5), y, size: 7.5, font: negrito, color: MARINHO,
        });
      } else {
        pagina.drawText(t, { x: cols[i] + 4, y, size: 7.5, font: negrito, color: MARINHO });
      }
    });
    y -= 18;
  };
  cabTabela();

  for (const ct of snap.contratos) {
    if (y - 14 < 80) {
      novaPagina();
      cabTabela();
    }
    pagina.drawText(limpar(ct.sgpContratoId ? `#${ct.sgpContratoId}` : "—"), {
      x: cols[0] + 4, y, size: 8, font: regular, color: TEXTO,
    });
    pagina.drawText(cortar(ct.cliente, regular, 8, cols[2] - cols[1] - 10), {
      x: cols[1] + 4, y, size: 8, font: regular, color: TEXTO,
    });
    pagina.drawText(cortar(ct.plano ?? "—", regular, 8, cols[3] - cols[2] - 10), {
      x: cols[2] + 4, y, size: 8, font: regular, color: CINZA,
    });
    const v = limpar(moeda(ct.valor));
    pagina.drawText(v, {
      x: cols[4] - 6 - regular.widthOfTextAtSize(v, 8), y, size: 8, font: regular, color: TEXTO,
    });
    y -= 13;
    if (ct.liberadaPor === "gestao") {
      pagina.drawText(
        cortar(
          `» liberada pela gestão: ${ct.aprovacaoMotivo ?? ""}${ct.aprovadoPor ? ` (${ct.aprovadoPor})` : ""}`,
          regular, 7, LARGURA - 20
        ),
        { x: cols[1] + 4, y: y + 2, size: 7, font: regular, color: VERDE }
      );
      y -= 10;
    }
  }
  y -= 8;
  }

  // ---------------- anexo II: exceções ----------------
  const temExcecoes = !ehGer && (
    snap.contratos.some((c) => c.liberadaPor === "gestao") ||
    snap.assinaturasDispensadas.length > 0 ||
    !snap.debito.aplicado);

  if (temExcecoes) {
    secao("Anexo II — decisões da gestão aplicadas");
    const nota = (t: string) => {
      garantir(14);
      for (const linha of quebrar(limpar(t), regular, 8.5, LARGURA - 12)) {
        garantir(12);
        pagina.drawText(linha, { x: MARGEM + 8, y, size: 8.5, font: regular, color: TEXTO });
        y -= 11;
      }
      y -= 3;
    };

    const manuais = snap.contratos.filter((c) => c.liberadaPor === "gestao");
    if (manuais.length > 0) {
      nota(
        ehRefid
          ? `${manuais.length} aditivo(s) liberado(s) manualmente pela gestão, sem as duas assinaturas no SGPsign. Detalhe por contrato no Anexo I.`
          : `${manuais.length} venda(s) liberada(s) manualmente pela gestão — a instalação estava pendente por agenda do operacional, e a venda foi reconhecida na competência. Detalhe por contrato no Anexo I.`
      );
    }
    for (const d of snap.assinaturasDispensadas) {
      nota(
        `Contrato ${d.sgpContratoId ? `#${d.sgpContratoId}` : ""} (${d.cliente}): assinatura dispensada — ${d.motivo}.`
      );
    }
    if (!snap.debito.aplicado) {
      nota(
        `Débito de clientes não ativos da coorte de ${mesBr(snap.debito.coorte)} não foi aplicado nesta competência.${snap.debito.observacao ? ` Motivo: ${snap.debito.observacao}` : ""}`
      );
    }
    y -= 6;
  }

  // ---------------- ciência ----------------
  garantir(80);
  y -= 16;
  const meio = MARGEM + LARGURA / 2;
  pagina.drawLine({ start: { x: MARGEM, y }, end: { x: meio - 20, y }, thickness: 0.6, color: CINZA });
  pagina.drawLine({ start: { x: meio + 20, y }, end: { x: A4[0] - MARGEM, y }, thickness: 0.6, color: CINZA });
  y -= 11;
  pagina.drawText(limpar(snap.vendedora), { x: MARGEM, y, size: 8, font: regular, color: CINZA });
  pagina.drawText("Financeiro Interlig", { x: meio + 20, y, size: 8, font: regular, color: CINZA });
  y -= 10;
  pagina.drawText("Ciência da agente", { x: MARGEM, y, size: 7, font: regular, color: CINZA });
  pagina.drawText("Conferência e pagamento", { x: meio + 20, y, size: 7, font: regular, color: CINZA });

  if (meta.pagoEm) {
    y -= 22;
    pagina.drawText(limpar(`PAGO EM ${dataBr(meta.pagoEm)}`), {
      x: MARGEM, y, size: 10, font: negrito, color: VERDE,
    });
  }

  rodape(pagina);
  return doc.save();
}

/** quebra simples por largura, respeitando palavras */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (fonte.widthOfTextAtSize(teste, tamanho) > largura && atual) {
      linhas.push(atual);
      atual = p;
    } else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas;
}
