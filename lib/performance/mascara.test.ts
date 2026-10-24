import { describe, expect, it } from "vitest";
import { mascararTexto } from "./mascara";

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
