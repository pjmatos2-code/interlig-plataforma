import { describe, expect, it } from "vitest";
import { dataHoraSgp, direcionamentoDaPagina, registroDeAlteracoes, responsavelPreenchido } from "./direcionamento";

// trecho no formato da página de ocorrência do SGP (dados fictícios)
const pagina = (linhas: [string, string][]) => `
<table><thead><tr><th>ID</th><th>Status</th></tr></thead><tbody><tr><td>1</td><td>Aberta</td></tr></tbody></table>
<table class="table"><thead><tr><th>Data Cadastro</th><th>Usu&aacute;rio</th><th>IP</th><th>A&ccedil;&atilde;o</th></tr></thead><tbody>
${linhas.map(([d, a]) => `<tr><td>${d}</td><td>fulano.tal</td><td>::1</td><td>${a}</td></tr>`).join("\n")}
</tbody></table>`;

describe("registro de alterações", () => {
  it("lê data, usuário e ação da tabela certa", () => {
    const r = registroDeAlteracoes(pagina([["20/11/2026 20:57:23", "Ocorr&ecirc;ncia alterada."]]));
    expect(r).toEqual([{ em: "2026-11-20T20:57:23-03:00", usuario: "fulano.tal", acao: "Ocorrência alterada." }]);
  });
  it("data do SGP no fuso de Santarém", () => {
    expect(dataHoraSgp("01/11/2026 07:05:09")).toBe("2026-11-01T07:05:09-03:00");
    expect(dataHoraSgp("sem data")).toBeNull();
  });
});

describe("responsavelPreenchido", () => {
  it("pega o usuário de destino, sem confundir com o próximo campo", () => {
    expect(responsavelPreenchido("Setor: Alterado de para Operacional Usuário responsável: Alterado de para jose.galdino Origem: Alterado de Telefone para WhatsApp")).toBe("jose.galdino");
    expect(responsavelPreenchido("Usuário responsável: Alterado de jose.galdino para railson.costa")).toBe("railson.costa");
    expect(responsavelPreenchido("Usuário responsável: Alterado de jose.galdino para Origem: Alterado de")).toBeNull();
    expect(responsavelPreenchido("Usuário responsável: Alterado de jose.galdino para Origem: Alterado de Telefone para WhatsApp")).toBeNull();
    expect(responsavelPreenchido("Anexo(s) cadastrado(s) com sucesso")).toBeNull();
  });
});

describe("direcionamentoDaPagina", () => {
  const fallback = { criadaEm: "2026-11-20T14:25:04-03:00", responsavel: "jose.galdino" };
  it("primeira vez que o responsável foi preenchido (o registro vem do mais novo ao mais antigo)", () => {
    const html = pagina([
      ["21/11/2026 09:00:00", "Usu&aacute;rio respons&aacute;vel: Alterado de jose.galdino para railson.costa"],
      ["20/11/2026 18:00:00", "Usu&aacute;rio respons&aacute;vel: Alterado de para outra.pessoa"],
      ["20/11/2026 20:58:23", "Anexo(s) cadastrado(s)"],
      ["20/11/2026 20:57:23", "Setor: Alterado de para Operacional Usu&aacute;rio respons&aacute;vel: Alterado de para jose.galdino"],
    ]);
    expect(direcionamentoDaPagina(html, fallback)).toEqual({ em: "2026-11-20T20:57:23-03:00", para: "jose.galdino", origem: "registro" });
  });
  it("sem alteração do campo: responsável veio na abertura", () => {
    expect(direcionamentoDaPagina(pagina([["20/11/2026 15:00:00", "Anexo cadastrado"]]), fallback)).toEqual({ em: fallback.criadaEm, para: "jose.galdino", origem: "abertura" });
  });
  it("responsável que não é gestor técnico não conta", () => {
    expect(direcionamentoDaPagina(pagina([["20/11/2026 18:00:00", "Usu&aacute;rio respons&aacute;vel: Alterado de para outra.pessoa"]]), { ...fallback, responsavel: "outra.pessoa" })).toBeNull();
  });
  it("sem responsável e sem registro: ainda não foi direcionada", () => {
    expect(direcionamentoDaPagina(pagina([]), { ...fallback, responsavel: null })).toBeNull();
  });
});
