import { describe, expect, it } from "vitest";
import { criarOcultador, mascararTexto, nomesInformadosNaConversa } from "./mascara";

describe("mascararTexto — minimização antes de gravar e antes da IA", () => {
  it("mascara CPF formatado e solto", () => {
    expect(mascararTexto("meu cpf é 123.456.789-09")).toBe("meu cpf é [CPF]");
    expect(mascararTexto("cpf 12345678909 ok")).toBe("cpf [CPF/TELEFONE] ok");
  });
  it("mascara telefones em vários formatos", () => {
    expect(mascararTexto("liga no (93) 99123-4567")).toBe("liga no [TELEFONE]");
    expect(mascararTexto("+55 93 99123-4567")).toBe("[TELEFONE]");
    expect(mascararTexto("zap 99123-4567")).toBe("zap [TELEFONE]");
  });
  it("mascara e-mail, CNPJ, CEP e números longos", () => {
    expect(mascararTexto("manda pra fulana.silva@gmail.com")).toBe("manda pra [EMAIL]");
    expect(mascararTexto("cnpj 12.345.678/0001-90")).toBe("cnpj [CNPJ]");
    expect(mascararTexto("cep 68370-000")).toBe("cep [CEP]");
    expect(mascararTexto("boleto 2379 0000 1234 5678 9012")).toBe("boleto [NÚMERO]");
  });
  it("mascara coordenadas e links de mapa enviados pelo cliente", () => {
    expect(mascararTexto("minha localização -3.1798077, -52.189879 ok")).toBe("minha localização [LOCALIZAÇÃO] ok");
    expect(mascararTexto("https://maps.google.com/?q=-3.17,-52.18")).toBe("[LOCALIZAÇÃO]");
  });
  it("não mexe em preço, velocidade e número da casa", () => {
    const t = "plano de 800 Mb por R$ 99,90, rua 7 nº 123, 1 Giga";
    expect(mascararTexto(t)).toBe(t);
  });
  it("troca o nome do contato, ignorando acento e caixa", () => {
    expect(mascararTexto("Oi Joao, aqui é da Interlig. JOÃO Pereira confirmou", ["João Pereira"])).toBe(
      "Oi [CLIENTE], aqui é da Interlig. [CLIENTE] [CLIENTE] confirmou"
    );
  });
  it("não mascara pedaço de palavra nem conectivos curtos", () => {
    expect(mascararTexto("Ana mandou banana", ["Ana da Silva"])).toBe("[CLIENTE] mandou banana");
  });
});

describe("criarOcultador — nome do cliente e bairros na exibição", () => {
  // nome entra em pedaços (cada palavra); bairro entra inteiro ("Cidade Nova" não esconde "nova" solto)
  const ocultar = criarOcultador(["Clesiany", "Souza", "Cidade Nova", "Ana"]);
  it("troca nome e bairro (sem acento, qualquer caixa, palavra inteira)", () => {
    expect(ocultar("Clesiany")).toBe("[omitido]");
    expect(ocultar("moro na cidade nova, perto da praça")).toBe("moro na [omitido], perto da praça");
    expect(ocultar("Sou a CLÉSIANY 😉 da Cidade Nova")).toBe("Sou a [omitido] 😉 da [omitido]");
  });
  it("não corta pedaço de palavra nem termo curto", () => {
    expect(ocultar("Souzaville e Ana Paula")).toBe("Souzaville e Ana Paula");
    expect(ocultar("a casa é nova")).toBe("a casa é nova");
  });
  it("sem termos devolve o texto igual", () => {
    expect(criarOcultador([])("Clesiany")).toBe("Clesiany");
  });
});

describe("nomesInformadosNaConversa", () => {
  const msg = (autor: string, texto: string) => ({ autor, texto });
  it("pega o nome digitado depois de 'qual o seu nome?'", () => {
    expect(nomesInformadosNaConversa([msg("agente", "Para começar, me diga: qual o seu nome?"), msg("cliente", "Clesiany")])).toEqual(["Clesiany"]);
    expect(nomesInformadosNaConversa([msg("agente", "Com quem eu falo?"), msg("cliente", "Oi, sou a Maria José")])).toEqual(["Maria", "José"]);
  });
  it("ignora resposta longa, com número ou sem pergunta de nome", () => {
    expect(nomesInformadosNaConversa([msg("agente", "Qual o seu nome?"), msg("cliente", "quero saber o preço do plano de 500 mega")])).toEqual([]);
    expect(nomesInformadosNaConversa([msg("agente", "Qual bairro?"), msg("cliente", "Cidade Nova")])).toEqual([]);
  });
});
