import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ criarClienteAdmin: () => ({}) }));
import { proximaTerca } from "./reunioes";

describe("reunião de terça", () => {
  it("sugere a terça da semana (ou a próxima) e a semana completa anterior", () => {
    expect(proximaTerca("2026-11-21")).toEqual({ data: "2026-11-24", periodo: { inicio: "2026-11-16", fim: "2026-11-22" } });
    expect(proximaTerca("2026-11-24")).toEqual({ data: "2026-11-24", periodo: { inicio: "2026-11-16", fim: "2026-11-22" } });
    expect(proximaTerca("2026-11-25")).toEqual({ data: "2026-12-01", periodo: { inicio: "2026-11-23", fim: "2026-11-29" } });
  });
});
