import type { ConfigSgp } from "@/lib/integracoes/config";
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

  constructor(private cfg: ConfigSgp) {}

  private get config() {
    const { base_url, token, app } = this.cfg;
    if (!base_url || !token || !app) {
      throw new Error(
        "Modo real exige URL, token e app do SGP — cadastre em Admin → Integrações."
      );
    }
    return { base: base_url.replace(/\/$/, ""), token, app };
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
