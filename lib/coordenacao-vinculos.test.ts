import { describe, expect, it } from "vitest";
import { lerVinculos, vinculosAtuais } from "./coordenacao-vinculos";

const JESSICA = "0ef435b9-0000-4000-8000-000000000001";
const AMANDA = "43c54e9c-0000-4000-8000-000000000002";
const DAMELY = "241bfc53-0000-4000-8000-000000000003";
const KAROLINE = "9ebb565f-0000-4000-8000-000000000004";
const MARCELO = "95aa134d-0000-4000-8000-00000000000a";
const ALINE = "25684ee1-0000-4000-8000-00000000000b";

describe("formulário de coordenação", () => {
  it("separa equipe, apoio e sem vínculo", () => {
    const f = new FormData();
    f.set("coordenador_id", MARCELO);
    f.set(`vinculo:${JESSICA}`, "equipe");
    f.set(`vinculo:${AMANDA}`, "apoio");
    f.set(`vinculo:${DAMELY}`, "apoio");
    f.set(`vinculo:${KAROLINE}`, "");
    expect(lerVinculos(f.entries())).toEqual({ equipe: [JESSICA], apoio: [AMANDA, DAMELY], nenhum: [KAROLINE] });
  });

  it("ignora campos de outro tipo, id que não é de agente e valor desconhecido", () => {
    const r = lerVinculos([
      ["coordenador_id", MARCELO],
      ["vinculo:qualquer-coisa", "equipe"],
      [`vinculo:${AMANDA}`, "dona"],
      ["vendedor_id", JESSICA],
    ]);
    expect(r).toEqual({ equipe: [], apoio: [], nenhum: [AMANDA] });
  });

  it("agente que não estava na tela não aparece em lista nenhuma", () => {
    const r = lerVinculos([[`vinculo:${JESSICA}`, "equipe"]]);
    expect([...r.equipe, ...r.apoio, ...r.nenhum]).toEqual([JESSICA]);
  });

  it("campo repetido: vale o último", () => {
    const r = lerVinculos([
      [`vinculo:${AMANDA}`, "equipe"],
      [`vinculo:${AMANDA}`, "apoio"],
    ]);
    expect(r).toEqual({ equipe: [], apoio: [AMANDA], nenhum: [] });
  });
});

describe("vínculos atuais de um coordenador", () => {
  const agentes = [
    { id: JESSICA, coordenador_id: MARCELO },
    { id: AMANDA, coordenador_id: ALINE },
    { id: DAMELY, coordenador_id: null },
    { id: KAROLINE, coordenador_id: null },
  ];

  it("equipe pelo vínculo direto, apoio pela lista de apoio", () => {
    expect(vinculosAtuais(MARCELO, agentes, [AMANDA, DAMELY])).toEqual({
      [JESSICA]: "equipe",
      [AMANDA]: "apoio",
      [DAMELY]: "apoio",
      [KAROLINE]: "",
    });
  });

  it("a equipe de outro coordenador não aparece como vínculo deste", () => {
    expect(vinculosAtuais(ALINE, agentes, [])).toEqual({ [JESSICA]: "", [AMANDA]: "equipe", [DAMELY]: "", [KAROLINE]: "" });
  });

  it("se a agente estiver nos dois, vale a equipe", () => {
    expect(vinculosAtuais(MARCELO, agentes, [JESSICA])[JESSICA]).toBe("equipe");
  });
});
