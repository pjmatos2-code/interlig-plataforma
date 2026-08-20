import type { SgpClient, SgpCliente, SgpContrato, SgpPlano, SgpTitulo } from "./tipos";

/**
 * SgpApiClient — cliente REAL da API do SGP (bookstack.sgp.net.br).
 * Autenticação por token + app enviados no corpo (PRD 7.1).
 *
 * ATENÇÃO (Fase 0): os caminhos de endpoint e o mapeamento campo-a-campo
 * abaixo são o esqueleto padrão do SGP e serão confirmados contra a instância
 * da Interlig pelo scripts/sgp-discovery.mjs assim que as credenciais
 * existirem. Até lá, use SGP_MODE=mock.
 */
export class SgpApiClient implements SgpClient {
  modo = "real" as const;

  private get config() {
    const base = process.env.SGP_BASE_URL;
    const token = process.env.SGP_TOKEN;
    const app = process.env.SGP_APP;
    if (!base || !token || !app) {
      throw new Error(
        "SGP_MODE=real exige SGP_BASE_URL, SGP_TOKEN e SGP_APP no ambiente (.env.local)."
      );
    }
    return { base: base.replace(/\/$/, ""), token, app };
  }

  private async chamar<T>(rota: string, corpo: Record<string, unknown> = {}): Promise<T> {
    const { base, token, app } = this.config;
    const resposta = await fetch(`${base}${rota}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, app, ...corpo }),
      cache: "no-store",
    });
    if (!resposta.ok) {
      throw new Error(`SGP ${rota} respondeu ${resposta.status}`);
    }
    return (await resposta.json()) as T;
  }

  async listarPlanos(): Promise<SgpPlano[]> {
    // TODO Fase 0: confirmar rota e formato na instância da Interlig
    const bruto = await this.chamar<{ planos?: unknown[] }>("/api/ura/planos/");
    void bruto;
    throw new Error(
      "Mapeamento real do SGP pendente da Fase 0 (rodar scripts/sgp-discovery.mjs com as credenciais)."
    );
  }

  async listarClientes(): Promise<SgpCliente[]> {
    throw new Error("Mapeamento real do SGP pendente da Fase 0.");
  }
  async listarContratos(): Promise<SgpContrato[]> {
    throw new Error("Mapeamento real do SGP pendente da Fase 0.");
  }
  async listarTitulos(): Promise<SgpTitulo[]> {
    throw new Error("Mapeamento real do SGP pendente da Fase 0.");
  }
}
