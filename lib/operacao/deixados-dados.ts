import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { diasDesde, janelaDeixados, situacaoDeixado, type SituacaoDeixado } from "./deixados";

export type ClienteDeixado = {
  osId: string;
  sgpContratoId: string;
  sgpClienteId: string | null;
  documento: string | null;
  cliente: string;
  unidade: string;
  bairro: string | null;
  vendedora: string | null;
  osCriadaEm: string;
  semanaDaOs: string;
  diasEsperando: number;
  tecnico: string | null;
  agendamento: string | null;
  situacao: SituacaoDeixado;
};

const unidadeDe = (pop: string | null | undefined) => {
  const p = (pop ?? "").toLowerCase();
  if (p.startsWith("vit")) return "Vitória do Xingu";
  if (p.startsWith("brasil")) return "Brasil Novo";
  if (p.startsWith("altamira")) return "Altamira";
  return pop?.trim() || "Sem unidade";
};

/**
 * Lista dos clientes deixados para trás (só leitura do espelho do SGP). A
 * página confere o perfil antes.
 */
export async function listarDeixados(agora = Date.now()): Promise<{ lista: ClienteDeixado[]; janela: { de: string; ate: string } }> {
  const admin = criarClienteAdmin();
  const hoje = new Date(agora - 3 * 3_600_000).toISOString().slice(0, 10);
  const janela = janelaDeixados(hoje);
  const os: { sgp_os_id: string; sgp_contrato_id: string | null; criada_em: string; pop: string | null; bairro: string | null; cliente_nome: string | null; status: string | null; agendamento: string | null; checkin: string | null; servico_prestado: string | null; responsavel: string | null }[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await admin
      .from("os_tecnicas")
      .select("sgp_os_id, sgp_contrato_id, criada_em, pop, bairro, cliente_nome, status, agendamento, checkin, servico_prestado, responsavel")
      .eq("motivo", "Instalação de equipamento")
      .gte("criada_em", `${janela.de}T00:00:00-03:00`)
      .lte("criada_em", `${janela.ate}T23:59:59-03:00`)
      .order("criada_em")
      .range(i, i + 999);
    if (error) throw new Error(error.message);
    os.push(...((data ?? []) as typeof os));
    if (!data || data.length < 1000) break;
  }
  // a primeira OS de instalação de cada contrato
  const porContrato = new Map<string, (typeof os)[number]>();
  for (const o of os) if (o.sgp_contrato_id && !porContrato.has(o.sgp_contrato_id)) porContrato.set(o.sgp_contrato_id, o);

  const ids = [...porContrato.keys()];
  const contratos = new Map<string, { status: string; data_ativacao: string | null; data_cancelamento: string | null; data_assinatura: string | null; cliente: string | null; cpf: string | null; sgpClienteId: string | null; pop: string | null; vendedora: string | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await admin
      .from("contratos")
      .select("sgp_contrato_id, status, data_ativacao, data_cancelamento, data_assinatura, clientes(nome, cpf, sgp_cliente_id), pops(nome), vendedores(nome)")
      .in("sgp_contrato_id", ids.slice(i, i + 300));
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      const cli = c.clientes as unknown as { nome: string | null; cpf: string | null; sgp_cliente_id: string | null } | null;
      contratos.set(String(c.sgp_contrato_id), {
        status: String(c.status),
        data_ativacao: (c.data_ativacao as string | null) ?? null,
        data_cancelamento: (c.data_cancelamento as string | null) ?? null,
        data_assinatura: (c.data_assinatura as string | null) ?? null,
        cliente: cli?.nome ?? null,
        cpf: cli?.cpf ?? null,
        sgpClienteId: cli?.sgp_cliente_id ? String(cli.sgp_cliente_id) : null,
        pop: (c.pops as unknown as { nome: string | null } | null)?.nome ?? null,
        vendedora: (c.vendedores as unknown as { nome: string | null } | null)?.nome ?? null,
      });
    }
  }

  const lista: ClienteDeixado[] = [];
  for (const [id, o] of porContrato) {
    const c = contratos.get(id);
    if (!c || c.data_ativacao || c.data_cancelamento || c.status === "cancelado") continue;
    const criadaDia = new Date(Date.parse(o.criada_em) - 3 * 3_600_000).toISOString().slice(0, 10);
    const dow = new Date(`${criadaDia}T12:00:00Z`).getUTCDay();
    const semanaDaOs = new Date(Date.parse(`${criadaDia}T12:00:00Z`) - ((dow + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    lista.push({
      osId: o.sgp_os_id,
      sgpContratoId: id,
      sgpClienteId: c.sgpClienteId,
      documento: c.cpf,
      cliente: c.cliente ?? o.cliente_nome ?? "—",
      unidade: unidadeDe(c.pop ?? o.pop),
      bairro: o.bairro,
      vendedora: c.vendedora,
      osCriadaEm: o.criada_em,
      semanaDaOs,
      diasEsperando: diasDesde(criadaDia, hoje),
      tecnico: o.responsavel,
      agendamento: o.agendamento,
      situacao: situacaoDeixado({ assinado: Boolean(c.data_assinatura), osStatus: o.status, checkin: o.checkin, servicoPrestado: o.servico_prestado, agendamento: o.agendamento }, agora),
    });
  }
  lista.sort((a, b) => b.diasEsperando - a.diasEsperando || a.cliente.localeCompare(b.cliente));
  return { lista, janela };
}
