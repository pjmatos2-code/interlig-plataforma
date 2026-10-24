import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { classificarErroIa } from "./erros";

const h = new Headers();
describe("classificarErroIa — falhas do provedor de IA", () => {
  it("chave inválida para a fila (não adianta tentar de novo)", () => {
    const r = classificarErroIa(new Anthropic.AuthenticationError(401, {}, "invalid x-api-key", h), "claude-haiku-5-5");
    expect(r).toMatchObject({ ok: false, motivo: "credencial", tentarDeNovo: false });
  });
  it("limite de uso e instabilidade: tenta de novo depois", () => {
    expect(classificarErroIa(new Anthropic.RateLimitError(429, {}, "rate limited", h), "m")).toMatchObject({ motivo: "limite", tentarDeNovo: true });
    expect(classificarErroIa(new Anthropic.InternalServerError(500, {}, "boom", h), "m")).toMatchObject({ motivo: "indisponivel", tentarDeNovo: true });
    expect(classificarErroIa(new Anthropic.APIConnectionError({ message: "ECONNRESET" }), "m")).toMatchObject({ motivo: "indisponivel", tentarDeNovo: true });
  });
  it("modelo inexistente ou requisição inválida: não repete", () => {
    expect(classificarErroIa(new Anthropic.NotFoundError(404, {}, "model not found", h), "modelo-x")).toMatchObject({ motivo: "requisicao", detalhe: 'modelo "modelo-x" não encontrado', tentarDeNovo: false });
    expect(classificarErroIa(new Anthropic.BadRequestError(400, {}, "bad", h), "m")).toMatchObject({ motivo: "requisicao", tentarDeNovo: false });
  });
  it("erro desconhecido não vira resultado: fica registrado como formato", () => {
    expect(classificarErroIa(new Error("json quebrado"), "m")).toMatchObject({ motivo: "formato", detalhe: "json quebrado", tentarDeNovo: true });
  });
});
