import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteSgp } from "@/lib/sgp/client";
import type { SgpContrato } from "@/lib/sgp/tipos";

/**
 * Worker de sincronização SGP → banco próprio (PRD 7.1).
 * Padrão: polling incremental + upsert + normalização; o dashboard NUNCA
 * consulta a API do SGP em tempo de renderização — só lê o banco.
 * Toda execução registra log em sync_runs (sucesso, parcial ou erro).
 */

type Admin = ReturnType<typeof criarClienteAdmin>;

const ENTIDADES = ["planos", "clientes", "contratos", "titulos"] as const;
export type Entidade = (typeof ENTIDADES)[number];

async function iniciarRun(admin: Admin, entidade: string) {
  const { data } = await admin
    .from("sync_runs")
    .insert({ entidade, status: "executando" })
    .select("id")
    .single();
  return data!.id as string;
}

async function finalizarRun(
  admin: Admin,
  id: string,
  status: "sucesso" | "erro" | "parcial",
  registros: number,
  erro?: string
) {
  await admin
    .from("sync_runs")
    .update({
      finalizado_em: new Date().toISOString(),
      status,
      registros,
      erro: erro ?? null,
    })
    .eq("id", id);
}

/** Normaliza o status cru do SGP para o enum da plataforma. */
export function normalizarStatus(c: SgpContrato): string {
  const s = c.status_sgp.toUpperCase();
  if (c.data_cancelamento || s.includes("CANCEL")) return "cancelado";
  if (s.includes("SUSPEN")) return "suspenso";
  if (c.data_ativacao || s === "ATIVO") return "ativo";
  if (c.data_assinatura || s.includes("INSTALA")) return "aguardando_ativacao";
  return "pendente_assinatura";
}

export type ResultadoSync = {
  modo: "mock" | "real";
  execucoes: { entidade: Entidade; registros: number; status: string; erro?: string }[];
};

export async function executarSync(): Promise<ResultadoSync> {
  const admin = criarClienteAdmin();
  const sgp = await criarClienteSgp();
  const execucoes: ResultadoSync["execucoes"] = [];

  // de/para de origem (PRD 3.10)
  const { data: mapa } = await admin.from("origem_map").select("valor_sgp, categoria");
  const origem = (valor: string | null) =>
    valor
      ? (mapa ?? []).find((m) => m.valor_sgp.toUpperCase() === valor.toUpperCase())?.categoria ??
        "outro"
      : null;

  // ---------- planos ----------
  {
    const run = await iniciarRun(admin, "planos");
    try {
      const planos = await sgp.listarPlanos();
      if (planos.length > 0) {
        const { error } = await admin.from("planos").upsert(
          planos.map((p) => ({
            sgp_plano_id: p.sgp_plano_id,
            nome: p.nome,
            velocidade: p.velocidade,
            valor_referencia: p.valor_referencia,
            ativo: p.ativo,
          })),
          { onConflict: "sgp_plano_id" }
        );
        if (error) throw new Error(error.message);
      }
      await finalizarRun(admin, run, "sucesso", planos.length);
      execucoes.push({ entidade: "planos", registros: planos.length, status: "sucesso" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finalizarRun(admin, run, "erro", 0, msg);
      execucoes.push({ entidade: "planos", registros: 0, status: "erro", erro: msg });
    }
  }

  // ---------- clientes ----------
  {
    const run = await iniciarRun(admin, "clientes");
    try {
      const clientes = await sgp.listarClientes();
      if (clientes.length > 0) {
        const { error } = await admin.from("clientes").upsert(
          clientes.map((c) => ({
            sgp_cliente_id: c.sgp_cliente_id,
            nome: c.nome,
            cpf: c.cpf,
            telefone: c.telefone,
            bairro: c.bairro,
            cidade: c.cidade,
            origem_cadastro: origem(c.origem_cadastro_sgp),
            sync_updated_at: new Date().toISOString(),
          })),
          { onConflict: "sgp_cliente_id" }
        );
        if (error) throw new Error(error.message);
      }
      await finalizarRun(admin, run, "sucesso", clientes.length);
      execucoes.push({ entidade: "clientes", registros: clientes.length, status: "sucesso" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finalizarRun(admin, run, "erro", 0, msg);
      execucoes.push({ entidade: "clientes", registros: 0, status: "erro", erro: msg });
    }
  }

  // ---------- contratos ----------
  {
    const run = await iniciarRun(admin, "contratos");
    try {
      const contratos = await sgp.listarContratos();
      let gravados = 0;
      const pendencias: string[] = [];

      if (contratos.length > 0) {
        // resolve FKs por id do SGP
        const [{ data: clientes }, { data: planos }, { data: vendedores }] = await Promise.all([
          admin.from("clientes").select("id, sgp_cliente_id, cidade"),
          admin.from("planos").select("id, sgp_plano_id"),
          admin.from("vendedores").select("id, sgp_vendedor_id, pop_id"),
        ]);
        const { data: pops } = await admin.from("pops").select("id, cidade");

        const clientePorSgp = new Map((clientes ?? []).map((c) => [c.sgp_cliente_id, c]));
        const planoPorSgp = new Map((planos ?? []).map((p) => [p.sgp_plano_id, p.id]));
        const vendedorPorSgp = new Map((vendedores ?? []).map((v) => [v.sgp_vendedor_id, v]));
        const popPorCidade = new Map((pops ?? []).map((p) => [p.cidade, p.id]));

        for (const c of contratos) {
          const cliente = clientePorSgp.get(c.sgp_cliente_id);
          if (!cliente) {
            pendencias.push(`contrato ${c.sgp_contrato_id}: cliente ${c.sgp_cliente_id} não sincronizado`);
            continue;
          }
          // vendedor não mapeado → null: aparece como "não atribuída", nunca some (PRD seção 2)
          const vendedor = c.sgp_vendedor_id ? vendedorPorSgp.get(c.sgp_vendedor_id) : undefined;
          const { error } = await admin.from("contratos").upsert(
            {
              sgp_contrato_id: c.sgp_contrato_id,
              cliente_id: cliente.id,
              vendedor_id: vendedor?.id ?? null,
              plano_id: c.sgp_plano_id ? planoPorSgp.get(c.sgp_plano_id) ?? null : null,
              pop_id: vendedor?.pop_id ?? popPorCidade.get(cliente.cidade ?? "") ?? null,
              valor_mensalidade: c.valor_mensalidade,
              valor_instalacao: c.valor_instalacao,
              status: normalizarStatus(c),
              origem_cadastro: origem(c.origem_cadastro_sgp),
              data_venda: c.data_venda,
              data_assinatura: c.data_assinatura,
              data_ativacao: c.data_ativacao,
              data_cancelamento: c.data_cancelamento,
              motivo_cancelamento: c.motivo_cancelamento,
              sync_updated_at: new Date().toISOString(),
            },
            { onConflict: "sgp_contrato_id" }
          );
          if (error) pendencias.push(`contrato ${c.sgp_contrato_id}: ${error.message}`);
          else gravados += 1;
        }
      }

      const status = pendencias.length > 0 ? "parcial" : "sucesso";
      await finalizarRun(admin, run, status, gravados, pendencias.join(" | ") || undefined);
      execucoes.push({
        entidade: "contratos",
        registros: gravados,
        status,
        erro: pendencias.join(" | ") || undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finalizarRun(admin, run, "erro", 0, msg);
      execucoes.push({ entidade: "contratos", registros: 0, status: "erro", erro: msg });
    }
  }

  // ---------- títulos ----------
  {
    const run = await iniciarRun(admin, "titulos");
    try {
      const titulos = await sgp.listarTitulos();
      let gravados = 0;
      if (titulos.length > 0) {
        const { data: contratos } = await admin.from("contratos").select("id, sgp_contrato_id");
        const contratoPorSgp = new Map((contratos ?? []).map((c) => [c.sgp_contrato_id, c.id]));
        for (const t of titulos) {
          const contratoId = contratoPorSgp.get(t.sgp_contrato_id);
          if (!contratoId) continue;
          const { error } = await admin.from("titulos").upsert(
            {
              sgp_titulo_id: t.sgp_titulo_id,
              contrato_id: contratoId,
              numero_parcela: t.numero_parcela,
              valor: t.valor,
              vencimento: t.vencimento,
              data_pagamento: t.data_pagamento,
              status: t.status,
              sync_updated_at: new Date().toISOString(),
            },
            { onConflict: "sgp_titulo_id" }
          );
          if (!error) gravados += 1;
        }
      }
      await finalizarRun(admin, run, "sucesso", gravados);
      execucoes.push({ entidade: "titulos", registros: gravados, status: "sucesso" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finalizarRun(admin, run, "erro", 0, msg);
      execucoes.push({ entidade: "titulos", registros: 0, status: "erro", erro: msg });
    }
  }

  return { modo: sgp.modo, execucoes };
}
