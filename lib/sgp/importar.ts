import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteSgp } from "@/lib/sgp/client";
import { normalizarStatus } from "@/lib/sync/worker";

/**
 * Importação pontual de um cliente do SGP pelo CPF/CNPJ — o elo que faltava
 * entre o CRM manual e o SGP: a vendedora fecha o ticket como Vendida, o
 * cadastro acabou de ser feito no SGP e a varredura ainda não passou por ele.
 * Em vez de esperar, consultamos a URA pelo CPF e gravamos cliente + contratos
 * na hora; a reconciliação (por CPF/telefone) vincula o ticket em seguida.
 */

export type ResultadoImportacao = {
  ok: boolean;
  clientes: number;
  contratos: number;
  /** ids (da plataforma) dos clientes importados/atualizados */
  clienteIds: string[];
  erro?: string;
};

export async function importarClientePorCpf(cpf: string): Promise<ResultadoImportacao> {
  const limpo = (cpf ?? "").replace(/\D/g, "");
  if (limpo.length < 11) return { ok: false, clientes: 0, contratos: 0, clienteIds: [], erro: "CPF/CNPJ inválido." };

  // janela vazia: não varre nada além do cliente injetado por CPF
  const sgp = await criarClienteSgp({ offset: 0, maxPaginas: 0 });
  if (sgp.modo !== "real" || !("carregarExtrasPorCpf" in sgp))
    return { ok: false, clientes: 0, contratos: 0, clienteIds: [], erro: "Integração SGP fora do modo real." };

  const achados = await (
    sgp as unknown as { carregarExtrasPorCpf: (cpfs: string[]) => Promise<number> }
  ).carregarExtrasPorCpf([limpo]);
  if (achados === 0)
    return { ok: false, clientes: 0, contratos: 0, clienteIds: [], erro: "CPF sem cadastro no SGP (ou fora do escopo de cidades)." };

  const [clientes, contratos] = await Promise.all([sgp.listarClientes(), sgp.listarContratos()]);
  if (clientes.length === 0)
    return { ok: false, clientes: 0, contratos: 0, clienteIds: [], erro: "Cliente fora do escopo de cidades da plataforma." };

  const admin = criarClienteAdmin();
  const agora = new Date().toISOString();

  const { error: erroCliente } = await admin.from("clientes").upsert(
    clientes.map((c) => ({
      sgp_cliente_id: c.sgp_cliente_id,
      nome: c.nome,
      cpf: c.cpf,
      telefone: c.telefone,
      bairro: c.bairro,
      cidade: c.cidade,
      sync_updated_at: agora,
    })),
    { onConflict: "sgp_cliente_id" }
  );
  if (erroCliente) return { ok: false, clientes: 0, contratos: 0, clienteIds: [], erro: erroCliente.message };

  const { data: linhasClientes } = await admin
    .from("clientes")
    .select("id, sgp_cliente_id, cidade")
    .in("sgp_cliente_id", clientes.map((c) => c.sgp_cliente_id));
  const clientePorSgp = new Map((linhasClientes ?? []).map((c) => [c.sgp_cliente_id as string, c]));
  const clienteIds = (linhasClientes ?? []).map((c) => c.id as string);

  // só INSERE contratos que ainda não existem — os existentes seguem com o
  // sync regular (que preserva atribuições, assinaturas e cancelamentos)
  const idsContratos = contratos.map((c) => c.sgp_contrato_id);
  const existentes = new Set<string>();
  for (let i = 0; i < idsContratos.length; i += 400) {
    const { data: parte } = await admin
      .from("contratos")
      .select("sgp_contrato_id")
      .in("sgp_contrato_id", idsContratos.slice(i, i + 400));
    for (const e of parte ?? []) existentes.add(e.sgp_contrato_id as string);
  }
  const novos = contratos.filter((c) => !existentes.has(c.sgp_contrato_id));
  if (novos.length === 0) return { ok: true, clientes: clientes.length, contratos: 0, clienteIds };

  const [{ data: planos }, { data: pops }] = await Promise.all([
    admin.from("planos").select("id, sgp_plano_id"),
    admin.from("pops").select("id, cidade"),
  ]);
  const planoPorSgp = new Map((planos ?? []).map((p) => [p.sgp_plano_id as string, p.id as string]));
  const popPorCidade = new Map((pops ?? []).map((p) => [p.cidade as string, p.id as string]));

  let gravados = 0;
  for (const c of novos) {
    const cliente = clientePorSgp.get(c.sgp_cliente_id);
    if (!cliente) continue;
    const statusNovo = normalizarStatus(c);
    const { error } = await admin.from("contratos").insert({
      sgp_contrato_id: c.sgp_contrato_id,
      cliente_id: cliente.id,
      vendedor_id: null, // o leitor de painel confirma a autoria no SGP
      plano_id: c.sgp_plano_id ? planoPorSgp.get(c.sgp_plano_id) ?? null : null,
      pop_id: popPorCidade.get((cliente.cidade as string) ?? "") ?? null,
      valor_mensalidade: c.valor_mensalidade,
      valor_instalacao: c.valor_instalacao,
      status: statusNovo,
      data_venda: c.data_venda,
      data_assinatura: c.data_assinatura,
      data_ativacao: statusNovo === "ativo" ? c.data_ativacao ?? agora.slice(0, 10) : c.data_ativacao,
      data_cancelamento: c.data_cancelamento,
      motivo_cancelamento: c.motivo_cancelamento,
      sync_updated_at: agora,
    });
    if (!error) gravados += 1;
  }
  return { ok: true, clientes: clientes.length, contratos: gravados, clienteIds };
}
