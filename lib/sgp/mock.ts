import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SgpClient, SgpCliente, SgpContrato, SgpPlano, SgpTitulo } from "./tipos";

/**
 * SgpMockClient — lê fixtures de docs/sgp-samples/ (CLAUDE.md).
 * As fixtures têm o MESMO formato que o SgpApiClient devolve depois de
 * normalizar a resposta real; trocar de modo não muda nenhuma tela.
 */
export class SgpMockClient implements SgpClient {
  modo = "mock" as const;

  private async ler<T>(arquivo: string): Promise<T[]> {
    const caminho = path.join(process.cwd(), "docs", "sgp-samples", arquivo);
    const conteudo = await readFile(caminho, "utf8");
    return JSON.parse(conteudo) as T[];
  }

  listarPlanos() {
    return this.ler<SgpPlano>("planos.json");
  }
  listarClientes() {
    return this.ler<SgpCliente>("clientes.json");
  }
  listarContratos() {
    return this.ler<SgpContrato>("contratos.json");
  }
  listarTitulos() {
    return this.ler<SgpTitulo>("titulos.json");
  }
}
