import "server-only";
import type { criarClienteAdmin } from "@/lib/supabase/admin";
import { escolherContrato, nomeParaBusca, variantesDocumento, type ContratoRef } from "./vinculo";

type Admin = ReturnType<typeof criarClienteAdmin>;
type Cliente = { id: string; nome: string };
type ContratoLinha = ContratoRef & {
  id: string;
  cliente_id: string;
  sgp_contrato_id: string | null;
  valor_mensalidade: number | null;
  planos: { valor_referencia: number } | null;
};

export type VinculoCaso = {
  contratoId: string;
  sgpContratoId: string | null;
  /** VTV: valor de tabela do plano (mensalidade se o plano não tiver) */
  vtv: number;
  clienteNome: string | null;
};

const soDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");
const palavras = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z]+/).filter(Boolean);

/**
 * Casa o caso de retenção com o contrato do titular (regras em vinculo.ts):
 * 1º pelo CPF/CNPJ citado na conversa; 2º pelo telefone do WhatsApp (últimos
 * 8 dígitos — o 9º dígito varia); 3º pelo nome completo, só quando um único
 * cliente tem exatamente esse nome.
 */
export async function casarContratoRetencao(
  admin: Admin,
  alvo: { documentos: string[]; telefone: string | null; nome: string | null; dataConversa: string }
): Promise<VinculoCaso | null> {
  const tentar = async (clientes: Cliente[]): Promise<VinculoCaso | null> => {
    if (clientes.length === 0) return null;
    const { data } = await admin
      .from("contratos")
      .select("id, cliente_id, sgp_contrato_id, status, data_venda, data_cancelamento, valor_mensalidade, planos(valor_referencia)")
      .in("cliente_id", clientes.map((c) => c.id));
    const contratos = (data ?? []) as unknown as ContratoLinha[];
    // telefone da família (vários titulares): primeiro o do mesmo nome do WhatsApp
    const primeiro = palavras(alvo.nome ?? "")[0];
    const xara = primeiro ? clientes.filter((c) => palavras(c.nome).includes(primeiro)) : [];
    const ct =
      (xara.length > 0 && xara.length < clientes.length
        ? escolherContrato(contratos.filter((x) => xara.some((c) => c.id === x.cliente_id)), alvo.dataConversa)
        : null) ?? escolherContrato(contratos, alvo.dataConversa);
    if (!ct) return null;
    const ref = Number(ct.planos?.valor_referencia ?? 0);
    return {
      contratoId: ct.id,
      sgpContratoId: ct.sgp_contrato_id,
      vtv: ref > 0 ? ref : Number(ct.valor_mensalidade ?? 0),
      clienteNome: clientes.find((c) => c.id === ct.cliente_id)?.nome ?? null,
    };
  };

  for (const doc of alvo.documentos) {
    const { data } = await admin.from("clientes").select("id, nome").in("cpf", variantesDocumento(doc));
    const r = await tentar((data ?? []) as Cliente[]);
    if (r) return r;
  }

  // 10 a 13 dígitos = telefone; o LID do WhatsApp (15+) não é número de ninguém
  const tel = soDigitos(alvo.telefone);
  if (tel.length >= 10 && tel.length <= 13) {
    const { data } = await admin.from("clientes").select("id, nome").like("telefone", `%${tel.slice(-8)}`).limit(20);
    const r = await tentar((data ?? []) as Cliente[]);
    if (r) return r;
  }

  const nome = nomeParaBusca(alvo.nome);
  if (nome) {
    const { data } = await admin.from("clientes").select("id, nome").ilike("nome", nome).limit(2);
    if (data?.length === 1) return tentar(data as Cliente[]);
  }
  return null;
}
