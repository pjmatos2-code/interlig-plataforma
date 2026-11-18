import { afterEach, describe, expect, it, vi } from "vitest";
import { SgpApiClient, type JanelaVarredura } from "./api";

/**
 * A URA lista os clientes em ordem alfabética e a varredura anda por posição
 * (offset). O SGP falso daqui é uma lista viva: entrega a fatia pedida e deixa
 * o teste mexer na lista entre uma página e outra, como acontece quando alguém
 * cadastra ou renomeia um cliente no meio da leitura.
 */
type Cadastro = ReturnType<typeof cadastro>;

const daquiA = (dias: number) => {
  const d = new Date(Date.now() + dias * 86_400_000);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

function cadastro(id: number, cidade = "ALTAMIRA") {
  return {
    id,
    nome: `Cliente ${String(id).padStart(4, "0")}`,
    cpfcnpj: String(id).padStart(11, "0"),
    endereco: { cidade, uf: "PA" },
    contratos: [
      { id: 9000 + id, status: "ATIVO", dataCadastro: daquiA(-30), servicos: [{ tipo: "internet", plano: { id: 1, descricao: "500 MEGA" } }] },
    ],
    titulos: [{ id: 50000 + id, clientecontrato_id: 9000 + id, status: "aberto", valor: 99.9, dataVencimento: daquiA(10) }],
  };
}

const base = (quantos: number) => Array.from({ length: quantos }, (_, i) => cadastro(i + 1));

/** `entrePaginas` roda depois de cada página entregue, antes do pedido da seguinte */
function sgpFalso(lista: Cadastro[], entrePaginas?: (entregues: number) => void) {
  let entregues = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      const pedido = JSON.parse(String(init?.body)) as { limit?: number; offset?: number; cpfcnpj?: string };
      if (pedido.cpfcnpj) {
        return new Response(JSON.stringify({ clientes: lista.filter((c) => c.cpfcnpj === pedido.cpfcnpj) }));
      }
      const inicio = pedido.offset ?? 0;
      const corpo = JSON.stringify({ paginacao: { total: lista.length }, clientes: lista.slice(inicio, inicio + (pedido.limit ?? 100)) });
      entregues += 1;
      entrePaginas?.(entregues);
      return new Response(corpo);
    })
  );
}

const leitor = (janela?: JanelaVarredura) =>
  new SgpApiClient({ base_url: "https://sgp.teste", token: "t", app: "a", modo: "real" }, janela);

/** ids que saem mais de uma vez: basta um para o Postgres recusar o lote inteiro do upsert */
const repetidos = (ids: string[]) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

afterEach(() => vi.unstubAllGlobals());

describe("varredura da URA: cada cliente uma vez só (18/11/2026)", () => {
  it("lista parada: devolve todos os cadastros, na ordem da lista", async () => {
    sgpFalso(base(250));
    const sgp = leitor();
    const ids = (await sgp.listarClientes()).map((c) => c.sgp_cliente_id);
    expect(ids).toEqual(base(250).map((c) => String(c.id)));
    expect(await sgp.listarContratos()).toHaveLength(250);
    expect(await sgp.listarTitulos()).toHaveLength(250);
  });

  it("cadastro novo no meio da leitura: quem volta na página seguinte não sai repetido", async () => {
    // O cadastro novo entra antes do ponto em que a leitura está e empurra
    // todo mundo uma posição: o último cliente da página lida volta como o
    // primeiro da próxima.
    const lista = base(250);
    sgpFalso(lista, (entregues) => {
      if (entregues === 1) lista.unshift(cadastro(9001));
    });
    const sgp = leitor();
    const clientes = (await sgp.listarClientes()).map((c) => c.sgp_cliente_id);
    const contratos = (await sgp.listarContratos()).map((c) => c.sgp_contrato_id);
    const titulos = (await sgp.listarTitulos()).map((t) => t.sgp_titulo_id);

    expect(repetidos(clientes)).toEqual([]);
    expect(repetidos(contratos)).toEqual([]);
    expect(repetidos(titulos)).toEqual([]);
    // ninguém some: os 250 que já estavam na lista foram lidos
    expect(clientes).toHaveLength(250);
    expect(contratos).toHaveLength(250);
    expect(titulos).toHaveLength(250);
  });

  it("dois cadastros novos em momentos diferentes da mesma leitura", async () => {
    const lista = base(350);
    sgpFalso(lista, (entregues) => {
      if (entregues === 1) lista.unshift(cadastro(9001));
      if (entregues === 3) lista.unshift(cadastro(9002));
    });
    const sgp = leitor();
    const clientes = (await sgp.listarClientes()).map((c) => c.sgp_cliente_id);
    expect(repetidos(clientes)).toEqual([]);
    expect(repetidos((await sgp.listarContratos()).map((c) => c.sgp_contrato_id))).toEqual([]);
    expect(repetidos((await sgp.listarTitulos()).map((t) => t.sgp_titulo_id))).toEqual([]);
    expect(clientes).toHaveLength(350);
  });

  it("cadastro de fora das cidades atendidas também vale uma vez", async () => {
    // o cliente 100 fecha a primeira página e é de outra cidade
    const lista = base(250).map((c) => (c.id === 100 ? cadastro(100, "SANTAREM") : c));
    sgpFalso(lista, (entregues) => {
      if (entregues === 1) lista.unshift(cadastro(9001));
    });
    const sgp = leitor();
    const fora = (await sgp.listarForaDoEscopo()).map((c) => c.sgp_cliente_id);
    expect(fora).toEqual(["100"]);
    expect(await sgp.listarClientes()).toHaveLength(249);
  });

  it("cliente renomeado no meio da leitura aparece duas vezes: vale a leitura mais recente", async () => {
    // sai do começo da lista, já lido, e vai para o fim com o nome novo
    const lista = base(250);
    sgpFalso(lista, (entregues) => {
      if (entregues !== 1) return;
      const [renomeado] = lista.splice(4, 1);
      lista.push({ ...renomeado, nome: "Zz Nome Corrigido" });
    });
    const clientes = await leitor().listarClientes();
    expect(repetidos(clientes.map((c) => c.sgp_cliente_id))).toEqual([]);
    expect(clientes.find((c) => c.sgp_cliente_id === "5")?.nome).toBe("Zz Nome Corrigido");
    // (a lista recuou uma posição: quem caiu na página já lida fica para uma
    // passada seguinte, como sempre foi)
  });

  it("extra do caçador: quem a janela já trouxe não repete, quem ela não trouxe entra", async () => {
    const lista = base(250);
    sgpFalso(lista);
    const sgp = leitor({ offset: 0, maxPaginas: 1 });
    // o 50 está na primeira página; o 200 fica além da janela
    await sgp.carregarExtrasPorCpf([lista[49].cpfcnpj, lista[199].cpfcnpj]);
    const ids = (await sgp.listarClientes()).map((c) => c.sgp_cliente_id);
    expect(repetidos(ids)).toEqual([]);
    expect(ids).toHaveLength(101);
    expect(ids).toContain("200");
  });

  it("o cursor continua andando por posição, com ou sem repetido", async () => {
    const lista = base(350);
    sgpFalso(lista, (entregues) => {
      if (entregues === 1) lista.unshift(cadastro(9001));
    });
    const sgp = leitor({ offset: 0, maxPaginas: 2 });
    expect(await sgp.listarClientes()).toHaveLength(199); // 200 posições lidas, uma repetida
    expect(sgp.progresso).toEqual({ proximoOffset: 200, total: 351, completou: false });

    vi.unstubAllGlobals();
    sgpFalso(base(150));
    const ateOFim = leitor({ offset: 100, maxPaginas: 8 });
    expect(await ateOFim.listarClientes()).toHaveLength(50);
    expect(ateOFim.progresso).toEqual({ proximoOffset: 0, total: 150, completou: true });
  });
});
