import { describe, expect, it } from "vitest";
import { cidadeComErroDeDigitacao, cidadeDoCadastro, cidadeEscopo, distanciaEdicao, localidadeAtendida } from "./cidade";

describe("grafias conhecidas (regra de 02/09/2026, sem mudança)", () => {
  it("reconhece as três cidades com variações de acento, UF e espaços", () => {
    expect(cidadeEscopo("ALTAMIRA")).toBe("Altamira");
    expect(cidadeEscopo("Altamira-PA")).toBe("Altamira");
    expect(cidadeEscopo("ALTAMIRA PARÁ")).toBe("Altamira");
    expect(cidadeEscopo("VITÓRIA DO  XINGU PA")).toBe("Vitória do Xingu");
    expect(cidadeEscopo("VTX")).toBe("Vitória do Xingu");
    expect(cidadeEscopo("Brasil Novo")).toBe("Brasil Novo");
  });

  it("reconhece os erros já mapeados e a cidade dentro de uma frase", () => {
    expect(cidadeEscopo("ALTAMIA")).toBe("Altamira");
    expect(cidadeEscopo("ALTAMIR")).toBe("Altamira");
    expect(cidadeEscopo("VITORIA DO XINFU")).toBe("Vitória do Xingu");
    expect(cidadeEscopo("ZONA RURAL DE VTX")).toBe("Vitória do Xingu");
    expect(cidadeEscopo("RAMAL DO ALTAMIRA KM 12")).toBe("Altamira");
  });

  it("não reconhece outra cidade, bairro, CEP nem campo vazio", () => {
    for (const c of ["SANTAREM", "URUARÁ", "LEONARDO DA VINCI", "68377-045", "", null, undefined]) {
      expect(cidadeEscopo(c)).toBeNull();
    }
  });
});

describe("distância de edição", () => {
  it("conta trocas, faltas, sobras e letras vizinhas invertidas", () => {
    expect(distanciaEdicao("ALTAMIRA", "ALTAMIRA")).toBe(0);
    expect(distanciaEdicao("ALTMIRA", "ALTAMIRA")).toBe(1); // falta uma letra
    expect(distanciaEdicao("ALTAMITA", "ALTAMIRA")).toBe(1); // letra trocada
    expect(distanciaEdicao("ALTMAIRA", "ALTAMIRA")).toBe(1); // vizinhas invertidas
    expect(distanciaEdicao("ALTANEIRA", "ALTAMIRA")).toBe(2);
  });
});

describe("erro de digitação da cidade (18/11/2026)", () => {
  it("os casos reais que deixaram venda de fora passam a ser reconhecidos", () => {
    expect(cidadeComErroDeDigitacao("ALTMIRA", "PA")).toBe("Altamira"); // cliente 19395
    expect(cidadeComErroDeDigitacao("ALTAMITA", "PA")).toBe("Altamira"); // cliente 19349
    expect(cidadeComErroDeDigitacao("NRASIL NOVO", "PA")).toBe("Brasil Novo"); // cliente 18517
    expect(cidadeComErroDeDigitacao("ALTAMIRS", "PA")).toBe("Altamira");
    expect(cidadeComErroDeDigitacao("ALRAMIRA", "PA")).toBe("Altamira");
    expect(cidadeComErroDeDigitacao("ALTMAIRA9", "PA")).toBe("Altamira");
  });

  it("aceita cadastro sem UF, e até dois erros nos nomes compridos", () => {
    expect(cidadeComErroDeDigitacao("ALTMIRA", "")).toBe("Altamira");
    expect(cidadeComErroDeDigitacao("ALTMIRA", null)).toBe("Altamira");
    expect(cidadeComErroDeDigitacao("BRAZIL NOBO", "PA")).toBe("Brasil Novo");
    expect(cidadeComErroDeDigitacao("VITORIA DO XNGU", "PA")).toBe("Vitória do Xingu");
    expect(cidadeComErroDeDigitacao("VITORA DO XINGO", "PA")).toBe("Vitória do Xingu");
  });

  it("com outra UF preenchida, o endereço é de fora: não reconhece", () => {
    expect(cidadeComErroDeDigitacao("ALTMIRA", "MA")).toBeNull();
    expect(cidadeComErroDeDigitacao("BRASIL NOBO", "MT")).toBeNull();
  });

  it("cidade de verdade parecida não passa por erro de digitação", () => {
    for (const c of ["ALTANEIRA", "ALMEIRIM", "ALTAIR", "ALTA FLORESTA", "ALTAMIRANDO", "BRASILEIA", "BRASIL", "VITORIA", "VITORIA DO JARI", "VITORIA DA CONQUISTA", "NOVO BRASIL"]) {
      expect(cidadeComErroDeDigitacao(c, "PA"), c).toBeNull();
    }
  });

  it("as cidades de fora que existem hoje no SGP continuam de fora", () => {
    const deFora: [string, string][] = [
      ["CASCAVEL", "PR"], ["BARUERI", "SP"], ["MUNDO NOVO", "MS"], ["SÃO PAULO", "SP"], ["BRASILIA", "DF"], ["BRASÍLIA", "DF"],
      ["SOUZEL", "PA"], ["POUSO ALEGRE", "MG"], ["PARIQUERA-AÇU", "SP"], ["URUARÁ", "PA"], ["FORTALEZA", "CE"],
      ["ANANINDEUA", "PA"], ["RURÓPOLIS", "PA"], ["SANTAREM", "PA"],
      ["BAIRRO LATICINIO", "PA"], ["CIDADE NOVA", "PA"], ["VITÓRIA", "PA"], ["", ""],
    ];
    for (const [cidade, uf] of deFora) {
      expect(cidadeDoCadastro({ endereco: { cidade, uf }, contratos: [{ endereco: { cidade, uf } }] }), cidade).toBeNull();
    }
  });
});

describe("Leonardo da Vinci e KM 18 contam como Vitória do Xingu (18/11/2026)", () => {
  it("reconhece as grafias que aparecem no SGP", () => {
    for (const c of ["LEONARDO DA VINCI", "LEONARDO DA VINCE", "Leonardo D'Vinci", "LEONARDO D'VINCE", "LEONARD D'VINCI", "LEONARDO D VINCI", "LEONARDO DVINCI", "LEONARDO DAVINCI", "VILA LEONARDO DA VINCI", "LEONARDO DA VINCI (KM18)", "KM 18 LEONARDO DVINCI", "KM 18", "KM18", "Km-18"]) {
      expect(localidadeAtendida(c, "PA"), c).toBe("Vitória do Xingu");
    }
  });

  it("os quatro cadastros que estavam de fora entram em Vitória do Xingu", () => {
    // clientes 14300, 16291, 16288 e 16287
    for (const cidade of ["LEONARDO DA VINCI", "LEONARDO DA VINCE", "KM 18"]) {
      expect(cidadeDoCadastro({ endereco: { cidade, uf: "PA" }, contratos: [{ endereco: { cidade, uf: "PA" } }] }), cidade).toBe("Vitória do Xingu");
    }
  });

  it("outro quilômetro, outro estado ou outro Leonardo não entram", () => {
    for (const c of ["KM 180", "KM 12", "KM 18 DA TRANSAMAZONICA", "LEONARDO", "VINCI", "SAO LEONARDO"]) {
      expect(localidadeAtendida(c, "PA"), c).toBeNull();
    }
    expect(localidadeAtendida("LEONARDO DA VINCI", "SP")).toBeNull();
  });

  it("cidade atendida no campo cidade continua mandando", () => {
    expect(cidadeDoCadastro({ endereco: { cidade: "ALTAMIRA - LEONARDO DA VINCI", uf: "PA" } })).toBe("Altamira");
    expect(cidadeDoCadastro({ endereco: { cidade: "VITORIA DO XINGU KM 18", uf: "PA" } })).toBe("Vitória do Xingu");
  });
});

describe("cidade que vale para o cadastro", () => {
  it("a cidade do cliente manda quando é reconhecida", () => {
    expect(cidadeDoCadastro({ endereco: { cidade: "ALTAMIRA", uf: "PA" } })).toBe("Altamira");
    expect(cidadeDoCadastro({ endereco: { cidade: "ALTMIRA", uf: "PA" }, contratos: [{ endereco: { cidade: "ALTMIRA", uf: "PA" } }] })).toBe("Altamira");
  });

  it("CEP no campo cidade: vale a cidade do endereço do contrato", () => {
    // clientes 13370 e 10627
    expect(cidadeDoCadastro({ endereco: { cidade: "68377-045", uf: "PA" }, contratos: [{ endereco: { cidade: "ALTAMIRA" } }, { endereco: { cidade: "ALTAMIRA" } }] })).toBe("Altamira");
    expect(cidadeDoCadastro({ endereco: { cidade: "68377-060", uf: "PA" }, contratos: [{ endereco: { cidade: "Altamira" } }] })).toBe("Altamira");
  });

  it("campo cidade vazio: vale a do contrato; sem contrato reconhecido, fica de fora", () => {
    expect(cidadeDoCadastro({ endereco: { cidade: "", uf: "" }, contratos: [{ endereco: { cidade: "BRASIL NOVO" } }] })).toBe("Brasil Novo");
    expect(cidadeDoCadastro({ endereco: { cidade: "", uf: "" }, contratos: [] })).toBeNull();
    expect(cidadeDoCadastro({ endereco: null })).toBeNull();
  });

  it("contratos em cidades diferentes não decidem sozinhos", () => {
    expect(cidadeDoCadastro({ endereco: { cidade: "68377-045" }, contratos: [{ endereco: { cidade: "ALTAMIRA" } }, { endereco: { cidade: "BRASIL NOVO" } }] })).toBeNull();
  });

  it("nome de outro lugar no cadastro não é trocado pela cidade do contrato", () => {
    // cliente 10246: endereço em Brasília, com contratos antigos em Altamira e Vitória do Xingu
    expect(cidadeDoCadastro({ endereco: { cidade: "BRASÍLIA", uf: "DF" }, contratos: [{ endereco: { cidade: "ALTAMIRA" } }] })).toBeNull();
    // cliente 10825: endereço em Ananindeua, contrato em Altamira
    expect(cidadeDoCadastro({ endereco: { cidade: "ANANINDEUA", uf: "PA" }, contratos: [{ endereco: { cidade: "ALTAMIRA" } }] })).toBeNull();
  });
});
