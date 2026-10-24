import { describe, expect, it } from "vitest";
import { vincularTicketPuro, type TicketRef } from "./vinculo";

const ms = (iso: string) => Date.parse(iso);
const porTel = new Map<string, TicketRef[]>([
  [
    "93991234567",
    [
      { id: "antigo-fechado", criado: ms("2026-08-01T10:00:00-03:00"), fechado: ms("2026-08-05T10:00:00-03:00") },
      { id: "atual-aberto", criado: ms("2026-10-20T10:00:00-03:00"), fechado: null },
    ],
  ],
  ["93990000000", [{ id: "nasceu-depois", criado: ms("2026-10-22T09:00:00-03:00"), fechado: null }]],
]);
const porProto = new Map([["P-1", "pelo-protocolo"]]);

describe("vínculo conversa → lead", () => {
  it("protocolo gravado no ticket vence o telefone", () => {
    expect(vincularTicketPuro("P-1", "93991234567", "2026-10-21T10:00:00-03:00", "2026-10-21T11:00:00-03:00", porProto, porTel)).toBe("pelo-protocolo");
  });
  it("pelo telefone: o ticket aberto mais recente, não o fechado em agosto", () => {
    expect(vincularTicketPuro(null, "93991234567", "2026-10-21T10:00:00-03:00", "2026-10-21T11:00:00-03:00", porProto, porTel)).toBe("atual-aberto");
  });
  it("conversa de agosto vai para o ticket de agosto", () => {
    expect(vincularTicketPuro(null, "93991234567", "2026-08-02T10:00:00-03:00", "2026-08-02T11:00:00-03:00", porProto, porTel)).toBe("antigo-fechado");
  });
  it("ticket criado depois (nasceu da conversa) é aceito em até 3 dias", () => {
    expect(vincularTicketPuro(null, "93990000000", "2026-10-20T08:00:00-03:00", "2026-10-20T08:30:00-03:00", porProto, porTel)).toBe("nasceu-depois");
  });
  it("sem telefone nem protocolo, sem vínculo (não inventa)", () => {
    expect(vincularTicketPuro(null, null, null, null, porProto, porTel)).toBeNull();
  });
});
