import { beforeEach, describe, expect, it, vi } from "vitest";
import { lerJsonSz } from "./sz-resposta";

// a coleta roda contra o SZ e o banco: aqui os dois são falsos
vi.mock("server-only", () => ({}));
const gravadas: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }) }),
  }),
}));
vi.mock("./persistir", () => ({
  VERSAO_CALCULO: 2,
  gravarConversa: async (_a: unknown, _c: unknown, conversa: { externoId: string }) => {
    gravadas.push(conversa.externoId);
  },
  carregarIndiceTickets: async () => ({ porProtocolo: new Map(), porTelefone: new Map() }),
  carregarResolverVendedor: async () => () => null,
}));
const listar = vi.fn();
vi.mock("./sz", () => ({
  EQUIPES_COMERCIAIS: {},
  abrirSessaoSz: async () => null,
  listarEncerradasDoDia: (...a: unknown[]) => listar(...a),
  baixarMensagensSz: async () => [],
}));
vi.mock("./sz-normalizar", () => ({ normalizarConversaSz: (item: { _id: string }) => ({ externoId: item._id }) }));
vi.mock("./calculo", () => ({ calcularConversa: () => ({}) }));

const { coletarDia } = await import("./job");
const ctx = { cfg: { expediente: {} }, ehDiaUtil: () => true, resolverVendedor: () => null } as never;

describe("lerJsonSz — falhas da API do chat viram erro, nunca 'zero conversas'", () => {
  it("HTTP de erro e HTML (sessão perdida) lançam; JSON passa", async () => {
    await expect(lerJsonSz(new Response("x", { status: 502 }), "relatório")).rejects.toThrow("SZ respondeu 502");
    await expect(lerJsonSz(new Response("<html>login</html>", { headers: { "content-type": "text/html" } }), "relatório")).rejects.toThrow("não devolveu JSON");
    await expect(lerJsonSz(new Response('{"data":[]}', { headers: { "content-type": "application/json" } }), "relatório")).resolves.toEqual({ data: [] });
  });
});

describe("coletarDia — retomada segura", () => {
  beforeEach(() => {
    gravadas.length = 0;
    listar.mockReset();
  });
  it("falha do SZ no meio do dia: guarda o que veio e marca a página para retomar", async () => {
    listar.mockResolvedValueOnce({ itens: [{ _id: "a" }, { _id: "b" }], proximaPagina: 2, paginasLidas: 1 }).mockRejectedValueOnce(new Error("relatório, página 2: SZ não devolveu JSON"));
    const r = await coletarDia("2026-10-20", { sz: {} as never, ctx });
    expect(gravadas).toEqual(["a", "b"]);
    expect(r).toMatchObject({ novas: 2, erros: 1, falhouListagem: true, proximaPagina: 2 });
  });
  it("retoma da página pedida e termina o dia (proximaPagina null)", async () => {
    listar.mockResolvedValueOnce({ itens: [{ _id: "c" }], proximaPagina: null, paginasLidas: 1 });
    const r = await coletarDia("2026-10-20", { sz: {} as never, ctx, paginaInicial: 2 });
    expect(listar.mock.calls[0][2]).toMatchObject({ paginaInicial: 2 });
    expect(r).toMatchObject({ novas: 1, proximaPagina: null });
  });
  it("prazo vence no meio da página: para antes de gravar e devolve a mesma página (relida e pulada na retomada)", async () => {
    listar.mockImplementationOnce(async () => {
      await new Promise((ok) => setTimeout(ok, 30)); // o SZ demorou mais que o prazo
      return { itens: [{ _id: "d" }], proximaPagina: null, paginasLidas: 1 };
    });
    const r = await coletarDia("2026-10-20", { sz: {} as never, ctx, prazoMs: 10, paginaInicial: 3 });
    expect(listar).toHaveBeenCalledTimes(1);
    expect(gravadas).toEqual([]);
    expect(r.proximaPagina).toBe(3);
  });
});
