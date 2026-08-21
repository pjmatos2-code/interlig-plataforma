import planos from "@/docs/sgp-samples/planos.json";
import clientes from "@/docs/sgp-samples/clientes.json";
import contratos from "@/docs/sgp-samples/contratos.json";
import titulos from "@/docs/sgp-samples/titulos.json";
import type { SgpClient, SgpCliente, SgpContrato, SgpPlano, SgpTitulo } from "./tipos";

/**
 * SgpMockClient — fixtures de docs/sgp-samples/ (CLAUDE.md), importadas
 * estaticamente para irem juntas no bundle serverless (a leitura dinâmica de
 * arquivo quebrava no deploy da Vercel). As fixtures têm o MESMO formato que
 * o SgpApiClient devolve depois de normalizar; trocar de modo não muda tela.
 */
export class SgpMockClient implements SgpClient {
  modo = "mock" as const;

  async listarPlanos(): Promise<SgpPlano[]> {
    return planos as SgpPlano[];
  }
  async listarClientes(): Promise<SgpCliente[]> {
    return clientes as SgpCliente[];
  }
  async listarContratos(): Promise<SgpContrato[]> {
    return contratos as SgpContrato[];
  }
  async listarTitulos(): Promise<SgpTitulo[]> {
    return titulos as SgpTitulo[];
  }
}
