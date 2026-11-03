import { describe, expect, it } from "vitest";
import {
  canceladoAntesDaConversa,
  casoDoMesmoCliente,
  dataDaConversa,
  documentosDaConversa,
  escolherContrato,
  nomeParaBusca,
  variantesDocumento,
} from "./vinculo";

const ct = (id: string, status: string, data_venda: string, data_cancelamento: string | null = null) => ({
  id,
  status,
  data_venda,
  data_cancelamento,
});

describe("data da conversa", () => {
  it("vem do protocolo do SZ, não do dia em que o robô criou o caso", () => {
    expect(dataDaConversa("2026102001468", "2026-10-26T18:07:00Z")).toBe("2026-10-20");
  });
  it("sem protocolo válido, usa a data de criação", () => {
    expect(dataDaConversa(null, "2026-10-26T18:07:00Z")).toBe("2026-10-26");
    expect(dataDaConversa("P-123", "2026-10-26T18:07:00Z")).toBe("2026-10-26");
  });
  it("cancelado na véspera da conversa ainda é o desfecho; antes disso é contrato antigo", () => {
    expect(canceladoAntesDaConversa("2026-10-19", "2026-10-20")).toBe(false);
    expect(canceladoAntesDaConversa("2026-10-18", "2026-10-20")).toBe(true);
    expect(canceladoAntesDaConversa(null, "2026-10-20")).toBe(false);
  });
});

describe("documentos citados na conversa", () => {
  it("acha CPF com e sem pontuação, sem repetir", () => {
    expect(documentosDaConversa("meu cpf é 529.982.247-25\nCPF 52998224725")).toEqual(["52998224725"]);
  });
  it("descarta telefone e CPF digitado errado (dígito verificador)", () => {
    expect(documentosDaConversa("liga no 93991234567 ou 52998224726")).toEqual([]);
  });
  it("acha CNPJ", () => {
    expect(documentosDaConversa("CNPJ 11.222.333/0001-81")).toEqual(["11222333000181"]);
  });
  it("busca nos formatos que o cadastro usa", () => {
    expect(variantesDocumento("52998224725")).toEqual(
      expect.arrayContaining(["52998224725", "529.982.247-25"])
    );
    expect(variantesDocumento("11222333000181")).toContain("11.222.333/0001-81");
  });
});

describe("nome do WhatsApp", () => {
  it("só serve com duas palavras, sem emoji", () => {
    expect(nomeParaBusca("Yuri Arimatea 🍀🐴🤠")).toBe("Yuri Arimatea");
    expect(nomeParaBusca("DENIRA SILVA E SILVA")).toBe("DENIRA SILVA E SILVA");
    expect(nomeParaBusca("Kauan🥵")).toBeNull();
    expect(nomeParaBusca("😑")).toBeNull();
  });
});

describe("escolha do contrato do caso", () => {
  it("o contrato cancelado depois da conversa é o desfecho — vence o ativo", () => {
    const r = escolherContrato(
      [ct("antigo-ativo", "ativo", "2023-04-29"), ct("novo-cancelado", "cancelado", "2026-10-06", "2026-10-07")],
      "2026-10-07"
    );
    expect(r?.id).toBe("novo-cancelado");
  });
  it("contrato cancelado anos antes não é deste caso", () => {
    const r = escolherContrato(
      [ct("2022", "cancelado", "2022-08-02", "2023-07-14"), ct("atual", "ativo", "2025-12-15")],
      "2026-10-06"
    );
    expect(r?.id).toBe("atual");
  });
  it("contrato vendido depois da conversa não entra", () => {
    const r = escolherContrato(
      [ct("de-setembro", "ativo", "2026-09-21"), ct("vendido-depois", "ativo", "2026-10-26")],
      "2026-10-08"
    );
    expect(r?.id).toBe("de-setembro");
  });
  it("sem contrato da época, não inventa vínculo", () => {
    expect(escolherContrato([ct("velho", "cancelado", "2022-08-02", "2024-07-12")], "2026-10-09")).toBeNull();
  });
});

describe("mesmo cliente (casos repetidos)", () => {
  const agoraMs = Date.parse("2026-10-31T23:00:00Z");
  const janela = { agoraMs, dias: 15 };
  const caso = (id: string, criado_em: string, campos: Partial<{ telefone: string; cliente_nome: string; sgp_contrato_id: string }>) => ({
    id,
    criado_em,
    telefone: campos.telefone ?? null,
    cliente_nome: campos.cliente_nome ?? null,
    sgp_contrato_id: campos.sgp_contrato_id ?? null,
  });

  it("caso manual sem telefone: reconhece pelo nome completo", () => {
    const manual = caso("manual", "2026-10-31T13:39:00Z", { cliente_nome: "OSVALCI SENA DA SILVA", sgp_contrato_id: "18859" });
    expect(casoDoMesmoCliente({ sgpContratoId: null, telefone: "5593991238721", nome: "Osvalci Sena da Silva" }, [manual], janela)?.id).toBe("manual");
  });
  it("mesmo contrato decide, mesmo com nome do WhatsApp diferente", () => {
    const manual = caso("manual", "2026-10-30T13:23:00Z", { cliente_nome: "SANDY MIRELLE FERREIRA FREIRE", sgp_contrato_id: "13535" });
    expect(casoDoMesmoCliente({ sgpContratoId: "13535", telefone: null, nome: "Sandy 💕" }, [manual], janela)?.id).toBe("manual");
  });
  it("telefone com e sem 55 é o mesmo número", () => {
    const robo = caso("robo", "2026-10-25T10:00:00Z", { telefone: "5593991236977" });
    expect(casoDoMesmoCliente({ sgpContratoId: null, telefone: "93991236977", nome: null }, [robo], janela)?.id).toBe("robo");
  });
  it("contratos diferentes são casos diferentes, mesmo com o mesmo nome", () => {
    const outro = caso("outro", "2026-10-30T10:00:00Z", { cliente_nome: "MARIA DAS GRACAS SILVA", sgp_contrato_id: "111" });
    expect(casoDoMesmoCliente({ sgpContratoId: "222", telefone: null, nome: "MARIA DAS GRAÇAS SILVA" }, [outro], janela)).toBeNull();
  });
  it("nome de duas palavras é comum demais para decidir sozinho", () => {
    const outro = caso("outro", "2026-10-30T10:00:00Z", { cliente_nome: "MARIA SILVA" });
    expect(casoDoMesmoCliente({ sgpContratoId: null, telefone: null, nome: "Maria Silva" }, [outro], janela)).toBeNull();
  });
  it("depois de 15 dias é caso novo (reincidência), não repetição", () => {
    const antigo = caso("antigo", "2026-10-10T10:00:00Z", { telefone: "93991236977" });
    expect(casoDoMesmoCliente({ sgpContratoId: null, telefone: "93991236977", nome: null }, [antigo], janela)).toBeNull();
    expect(casoDoMesmoCliente({ sgpContratoId: null, telefone: "93991236977", nome: null }, [antigo])?.id).toBe("antigo");
  });
});
