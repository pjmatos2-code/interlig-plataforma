import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  familiaPlano,
  familiasDoFiltro,
  lerFiltroLista,
  planosDoEscopo,
  queryLista,
  telefoneLimpo,
  type ResumoFidelidade,
} from "./fidelidade";
import { PainelSgp } from "./painel";

const vazio = { sem: {}, ate30: {}, ate60: {}, ate90: {} };
const zeros = { sem: 0, ate30: 0, ate60: 0, ate90: 0 };
const resumo = (planosPorUnidade: Record<number, Record<string, number>>): ResumoFidelidade => ({
  atualizadoEm: "2026-11-04T06:00:00Z",
  unidades: [
    { pop: 1, nome: "Altamira" },
    { pop: 2, nome: "Vitória do Xingu" },
    { pop: 12, nome: "Brasil Novo" },
  ].map((u) => ({ ...u, faixas: zeros, excluidos: zeros, planos: { ...vazio, sem: planosPorUnidade[u.pop] ?? {} } })),
});

describe("planosDoEscopo — a mesma conta do gráfico e da lista", () => {
  it("soma as unidades e ordena do maior para o menor", () => {
    const r = resumo({ 1: { "400 MB": 10, "200 MB corporativo": 3 }, 12: { "400 MB": 2, "1 GB": 5 } });
    const p = planosDoEscopo(r.unidades, null, "sem");
    expect(p.principais).toEqual([["400 MB", 12], ["1 GB", 5], ["200 MB corporativo", 3]]);
    expect(p.resto).toEqual([]);
    expect(p.total).toBe(20);
  });
  it("filtra a unidade pelo pop do SGP", () => {
    const r = resumo({ 1: { "400 MB": 10 }, 12: { "400 MB": 2, "1 GB": 5 } });
    expect(planosDoEscopo(r.unidades, 12, "sem").principais).toEqual([["1 GB", 5], ["400 MB", 2]]);
  });
  it("junta o que passa de 14 planos em resto, com empate decidido pelo nome", () => {
    const planos = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`Plano ${String(i).padStart(2, "0")}`, 1]));
    const p = planosDoEscopo(resumo({ 1: planos }).unidades, null, "sem");
    expect(p.principais).toHaveLength(14);
    expect(p.resto.map(([n]) => n)).toEqual(["Plano 14", "Plano 15"]);
  });
});

describe("filtro da lista", () => {
  it("faixa padrão é sem fidelidade e unidade inválida vira todas", () => {
    expect(lerFiltroLista({ faixa: "xyz", unidade: "99" }, null)).toEqual({ faixa: "sem", pop: null, plano: null, outros: false });
  });
  it("a coordenação de unidade não troca de unidade pela URL", () => {
    expect(lerFiltroLista({ unidade: "1", plano: "400 MB" }, { pop: 12 }).pop).toBe(12);
  });
  it("outros vale mais que plano; plano vem sem espaços nas pontas", () => {
    expect(lerFiltroLista({ plano: "400 MB", outros: "1" }, null)).toMatchObject({ plano: null, outros: true });
    expect(lerFiltroLista({ plano: "  200 MB corporativo " }, null).plano).toBe("200 MB corporativo");
  });
  it("a querystring volta ao mesmo filtro", () => {
    const f = lerFiltroLista({ faixa: "ate30", unidade: "2", plano: "Rede neutra (Netsky)" }, null);
    const q = Object.fromEntries(new URLSearchParams(queryLista(f)));
    expect(lerFiltroLista(q, null)).toEqual(f);
  });
});

describe("familiasDoFiltro — o número que o gráfico mostra", () => {
  const planos = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`Plano ${String(i).padStart(2, "0")}`, 16 - i]));
  const r = resumo({ 1: { ...planos, "200 MB corporativo": 29 } });
  it("um plano: só ele e a contagem dele", () => {
    const f = familiasDoFiltro(lerFiltroLista({ plano: "200 MB corporativo" }, null), r);
    expect(f).toEqual({ familias: ["200 MB corporativo"], noGrafico: 29, titulo: "200 MB corporativo" });
  });
  it("outros: exatamente os planos que o gráfico juntou", () => {
    const f = familiasDoFiltro(lerFiltroLista({ outros: "1" }, null), r);
    expect(f.familias).toEqual(["Plano 13", "Plano 14", "Plano 15"]);
    expect(f.noGrafico).toBe(3 + 2 + 1);
    expect(f.titulo).toBe("Outros 3 planos");
  });
  it("sem plano: todos", () => {
    const f = familiasDoFiltro(lerFiltroLista({}, null), r);
    expect(f.familias).toBeNull();
    expect(f.noGrafico).toBe(29 + (16 * 17) / 2);
  });
});

describe("telefone e grupo do plano", () => {
  it("telefone fica só com dígitos e DDD, sem o 55", () => {
    expect(telefoneLimpo("(93) 99123-4567")).toBe("93991234567");
    expect(telefoneLimpo("5593991234567")).toBe("93991234567");
    expect(telefoneLimpo("9312345")).toBeNull();
    expect(telefoneLimpo(null)).toBeNull();
  });
  it("plano corporativo do SGP cai no grupo do gráfico", () => {
    expect(familiaPlano("FIBRA CORPORATE 200MB")).toBe("200 MB corporativo");
    expect(familiaPlano("FIBRA 400MB | PÓS PAGO")).toBe("400 MB");
  });
});

describe("leitura do relatório Fidelidades do SGP", () => {
  afterEach(() => vi.unstubAllGlobals());
  // HTML no formato do SGP (04/11/2026), com clientes fictícios
  const html = `<table class="table"><thead><tr><th>Contrato</th><th>Status</th><th>Vencimento</th><th>Fidelidade</th>
    <th>Início</th><th>Fim</th><th>Dias restantes</th><th>Multa</th></tr></thead><tbody>
    <tr><td><a href="/admin/cliente/15802/edit/">19024 - MARIA DE TESTE</a> 18534 - Login: 000, INTERLIG PLAY ISENTO, Contrato: 19024<br>
    18533 - Login: mariateste, MAC: , FIBRA 400MB | PÓS PAGO, Contrato: 19024</td><td>Ativo</td><td>14</td>
    <td>PL-400MB - TAXA ISENTA</td><td>06/11/2025</td><td>06/11/2026</td><td>2</td><td>R$ 0,00</td></tr>
    <tr><td><a href="/admin/cliente/7/edit/">18305 - JOSÉ &amp; FILHOS</a> 17713 - Login: x, FIBRA CORPORATE 200MB, Contrato: 18305</td>
    <td>Ativo</td><td>21</td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td><a href="/admin/cliente/9/edit/">18400 - G.T. COMERCIO LTDA</a> 18401 - Contrato: 18400 - Login: - FIBRA 100MB | PJ</td>
    <td>Ativo</td><td>5</td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody></table>`;
  it("tira contrato, cliente, ID do cliente, fim e dias restantes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status: 200 })));
    const painel = new PainelSgp("https://sgp.exemplo", "u", "s");
    (painel as unknown as { logado: boolean }).logado = true;
    const linhas = await painel.linhasRelatorioFidelidade({ pop: "12" });
    expect(linhas.map(({ texto: _t, ...l }) => l)).toEqual([
      { contrato: "19024", clienteId: "15802", cliente: "MARIA DE TESTE", fim: "2026-11-06", dias: 2 },
      { contrato: "18305", clienteId: "7", cliente: "JOSÉ & FILHOS", fim: null, dias: null },
      { contrato: "18400", clienteId: "9", cliente: "G.T. COMERCIO LTDA", fim: null, dias: null },
    ]);
    expect(linhas[0].texto).toContain("FIBRA 400MB | PÓS PAGO");
  });
});
