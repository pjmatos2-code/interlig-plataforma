import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO, mesclarConfig, pesosDoSetor } from "./config";

describe("mesclarConfig — o que o gestor salva por cima dos padrões", () => {
  it("sem nada salvo devolve o padrão (cópia, não a referência)", () => {
    const c = mesclarConfig(null);
    expect(c).toEqual(CONFIG_PADRAO);
    expect(c).not.toBe(CONFIG_PADRAO);
  });
  it("aplica pesos e SLA válidos", () => {
    const c = mesclarConfig({ pesos: { ipc: { esforco: 30 } }, sla: { primeira_resposta_min: 10 } });
    expect(c.pesos.ipc).toEqual({ esforco: 30, resultado: 40, qualidade: 25 });
    expect(c.sla.primeira_resposta_min).toBe(10);
  });
  it("descarta negativos, texto no lugar de número e chaves desconhecidas", () => {
    const c = mesclarConfig({ pesos: { ipc: { esforco: -5, resultado: "40" } }, inventado: 1 });
    expect(c.pesos.ipc).toEqual(CONFIG_PADRAO.pesos.ipc);
    expect((c as unknown as Record<string, unknown>).inventado).toBeUndefined();
  });
  it("frações ficam em [0,1] e pesos em [0,100]", () => {
    const c = mesclarConfig({ faixas: { conversao: { alvo: 3 } }, pesos: { resultado: { meta_vendas: 500 } } });
    expect(c.faixas.conversao.alvo).toBe(1);
    expect(c.pesos.resultado.meta_vendas).toBe(100);
  });
  it("faixa com piso ≥ alvo volta ao padrão", () => {
    const c = mesclarConfig({ faixas: { followups_prazo: { piso: 0.9, alvo: 0.5 } } });
    expect(c.faixas.followups_prazo).toEqual(CONFIG_PADRAO.faixas.followups_prazo);
  });
  it("expediente só aceita HH:MM com início antes do fim", () => {
    const c = mesclarConfig({ expediente: { "6": [["07:30", "13:00"]], "1": [["18:00", "08:00"]] } });
    expect(c.expediente["6"]).toEqual([["07:30", "13:00"]]);
    expect(c.expediente["1"]).toEqual(CONFIG_PADRAO.expediente["1"]);
  });
  it("tolerância e provedor só aceitam valores conhecidos", () => {
    const c = mesclarConfig({ followup: { tolerancia: "qualquer" }, ia: { provedor: "outro", habilitada: true } });
    expect(c.followup.tolerancia).toBe("fim_do_dia");
    expect(c.ia.provedor).toBe("anthropic");
    expect(c.ia.habilitada).toBe(true);
  });
});

describe("pesosDoSetor — regras distintas por função", () => {
  it("sobrescreve só o que o setor define", () => {
    const c = mesclarConfig({ pesos_por_setor: { comercial_externo: { esforco: { sla_primeira_resposta: 0 }, lixo: { x: 1 } } } });
    const p = pesosDoSetor(c, "comercial_externo");
    expect(p.esforco.sla_primeira_resposta).toBe(0);
    expect(p.esforco.followups_prazo).toBe(20);
    expect(pesosDoSetor(c, "comercial_interno").esforco.sla_primeira_resposta).toBe(10);
  });
});
