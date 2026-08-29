// prova do gerador com dados representativos, sem depender do Next
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
const src = await readFile("lib/comissao/demonstrativo-pdf.ts","utf8");
// transpila na unha o suficiente para rodar: remove tipos e imports do projeto
let js = src
  .replace(/import "server-only";\n/, "")
  .replace(/import \{ PDFDocument[\s\S]*?from "pdf-lib";/, "")
  .replace(/import type \{ SnapshotComissao \}[\s\S]*?;\n/, "")
  .replace(/import \{ codigoVerificacao \}[\s\S]*?;\n/, "")
  .replace(/: Promise<Uint8Array>/g, "")
  .replace(/: SnapshotComissao/g, "").replace(/: PDFFont/g,"").replace(/: PDFPage/g,"")
  .replace(/: \{ vendedorId: string; versao: number; pagoEm\?: string \| null \}/g, "")
  .replace(/^export type[\s\S]*?^};$/gm, "")
  .replace(/: \[number, number\]/g,"").replace(/: string\[\]/g,"").replace(/: number/g,"").replace(/: string/g,"").replace(/: boolean/g,"")
  .replace(/export /g,"");
js = `import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
function codigoVerificacao(a,b,c,d){return "TESTE-12345";}
` + js;
await writeFile("scripts/_gen.mjs", js);
const { gerarDemonstrativoPdf } = await import("./_gen.mjs");
const snap = {
  competencia: "2026-08-01", vendedora: "Damely Rodrigues", pop: "Altamira",
  regra: { degraus: [], gatilhos: [], estornoDias: 90 },
  meta: 70,
  resultado: { atingimentoPct: 0.914, degrau: { valor: 3, tipo: "percentual_vtv" },
    vendasComissionaveis: 64, vendasPendentes: 10, estornos: 2, valorBase: 7420.5,
    bonusFixo: 0, gatilhos: [{descricao:"Bonus por ticket medio acima de R$ 120", adicional: 150}],
    total: 372.62, totalSeLiberar: 480.10, debitoMeta: 0, metaEfetiva: 70 },
  debito: { aplicado: false, quantidade: 15, coorte: "2026-05-01",
    observacao: "Transicao de regra: as pendencias foram anunciadas em 01/08 pela janela de 90 dias; a coorte M-3 entrou em 28/08. Agosto fecha sem debito para nao penalizar quem se programou pelo numero original." },
  contratos: Array.from({length: 28}, (_,i)=>({
    sgpContratoId: String(22300+i), cliente: ["MARIA DAS GRACAS OLIVEIRA","JOSE ANTONIO DA SILVA JUNIOR","ANA BEATRIZ NASCIMENTO","CARLOS EDUARDO FERREIRA LIMA"][i%4],
    plano: ["FIBRA 400MB | POS PAGO","FIBRA 800MB | POS PAGO"][i%2], valor: i%2?138.56:99.90,
    dataVenda: `2026-08-${String((i%28)+1).padStart(2,"0")}`, status:"ativo",
    liberadaPor: i===3||i===17 ? "gestao":"regra",
    ...(i===3||i===17 ? {aprovacaoMotivo:"venda do dia 31, instalacao agendada para 02/09 pela agenda do operacional", aprovadoPor:"Paulo Matos"}:{})
  })),
  assinaturasDispensadas: [{sgpContratoId:"22436", cliente:"CONDOMINIO TROPICAL PRIME", motivo:"2o ponto em cortesia, sem fidelidade"}],
  fechadoEm: "2026-09-01T12:00:00.000Z", fechadoPor: "Paulo Matos",
};
const bytes = await gerarDemonstrativoPdf(snap, { vendedorId:"abc", versao:1, pagoEm:null });
const out = "/private/tmp/claude-501/-Users-paulomatosjr-Documents-Claude-code-/fdafcb26-a701-4cb4-9b69-0074719fbb18/scratchpad/demonstrativo-exemplo.pdf";
await writeFile(out, bytes);
console.log("gerado:", out, Math.round(bytes.length/1024)+"KB");
