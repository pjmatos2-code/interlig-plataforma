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

const ENTIDADES = ["planos", "clientes", "contratos", "titulos", "assinaturas"] as const;
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
  // D12b: INATIVO no SGP = cadastro feito, instalação ainda não concluída
  if (s.includes("INATIV")) return "aguardando_ativacao";
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

  // cursor da varredura incremental (cabe no tempo do serverless; a base
  // inteira se renova em janelas sucessivas a cada execução do cron)
  const { lerConfigSgp } = await import("@/lib/integracoes/config");
  const cfgSgp = await lerConfigSgp();
  const { data: cfgBruta } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "sgp")
    .maybeSingle();
  const cursor = Number((cfgBruta?.config as Record<string, unknown>)?.scan_offset ?? 0) || 0;

  const sgp = await criarClienteSgp(
    cfgSgp.modo === "real" ? { offset: cursor, maxPaginas: 8 } : undefined
  );
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
      const linhasClientes = clientes.map((c) => ({
        sgp_cliente_id: c.sgp_cliente_id,
        nome: c.nome,
        cpf: c.cpf,
        telefone: c.telefone,
        bairro: c.bairro,
        cidade: c.cidade,
        origem_cadastro: origem(c.origem_cadastro_sgp),
        sync_updated_at: new Date().toISOString(),
      }));
      for (let i = 0; i < linhasClientes.length; i += 500) {
        const { error } = await admin
          .from("clientes")
          .upsert(linhasClientes.slice(i, i + 500), { onConflict: "sgp_cliente_id" });
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
        // o PostgREST corta selects em 1000 linhas — busca APENAS os registros
        // da janela atual, em blocos de .in()
        const idsClientes = [...new Set(contratos.map((x) => x.sgp_cliente_id))];
        const idsContratos = contratos.map((x) => x.sgp_contrato_id);
        const clientes: { id: string; sgp_cliente_id: string; cidade: string | null }[] = [];
        for (let i = 0; i < idsClientes.length; i += 400) {
          const { data: parte } = await admin
            .from("clientes")
            .select("id, sgp_cliente_id, cidade")
            .in("sgp_cliente_id", idsClientes.slice(i, i + 400));
          clientes.push(...((parte ?? []) as typeof clientes));
        }
        type Existente = {
          sgp_contrato_id: string;
          data_cancelamento: string | null;
          vendedor_id: string | null;
          data_assinatura: string | null;
          assinaturas_verificadas_em: string | null;
          data_ativacao: string | null;
};
        const existentes: Existente[] = [];
        for (let i = 0; i < idsContratos.length; i += 400) {
          const { data: parte } = await admin
            .from("contratos")
            .select("sgp_contrato_id, data_cancelamento, vendedor_id, data_assinatura, data_ativacao, assinaturas_verificadas_em")
            .in("sgp_contrato_id", idsContratos.slice(i, i + 400));
          existentes.push(...((parte ?? []) as Existente[]));
        }
        const [{ data: planos }, { data: vendedores }, { data: pops }] = await Promise.all([
          admin.from("planos").select("id, sgp_plano_id"),
          admin.from("vendedores").select("id, sgp_vendedor_id, pop_id"),
          admin.from("pops").select("id, cidade"),
        ]);
        const anterior = new Map(existentes.map((e) => [e.sgp_contrato_id, e]));

        const clientePorSgp = new Map((clientes ?? []).map((c) => [c.sgp_cliente_id, c]));
        const planoPorSgp = new Map((planos ?? []).map((p) => [p.sgp_plano_id, p.id]));
        const vendedorPorSgp = new Map((vendedores ?? []).map((v) => [v.sgp_vendedor_id, v]));
        const popPorCidade = new Map((pops ?? []).map((p) => [p.cidade, p.id]));

        const linhas = [];
        for (const c of contratos) {
          const cliente = clientePorSgp.get(c.sgp_cliente_id);
          if (!cliente) {
            pendencias.push(`contrato ${c.sgp_contrato_id}: cliente ${c.sgp_cliente_id} não sincronizado`);
            continue;
          }
          // vendedor não mapeado → null: aparece como "não atribuída", nunca some (PRD seção 2)
          const vendedor = c.sgp_vendedor_id ? vendedorPorSgp.get(c.sgp_vendedor_id) : undefined;
          const antes = anterior.get(c.sgp_contrato_id);
          // não regride: mantém cancelamento enriquecido, atribuição e assinaturas
          const dataCancelamento =
            c.data_cancelamento && antes?.data_cancelamento
              ? (antes.data_cancelamento as string)
              : c.data_cancelamento;
          const vendedorFinal = vendedor?.id ?? (antes?.vendedor_id as string | null) ?? null;
          const dataAssinatura = antes?.assinaturas_verificadas_em
            ? ((antes.data_assinatura as string | null) ?? null)
            : c.data_assinatura;
          // D12b: a data de ativação REAL é a virada Inativo→Ativo observada
          // pelo sync. Preserva a data já registrada; quando o contrato vira
          // ativo e ainda não tinha data, carimba hoje.
          const statusNovo = normalizarStatus(c);
          const ativacaoAntes = (antes?.data_ativacao as string | null) ?? null;
          const dataAtivacao =
            statusNovo === "ativo"
              ? ativacaoAntes ?? c.data_ativacao ?? new Date().toISOString().slice(0, 10)
              : statusNovo === "cancelado" || statusNovo === "suspenso"
                ? ativacaoAntes ?? c.data_ativacao
                : null; // aguardando/pendente: sem instalação
          linhas.push({
            sgp_contrato_id: c.sgp_contrato_id,
            cliente_id: cliente.id,
            vendedor_id: vendedorFinal,
            plano_id: c.sgp_plano_id ? planoPorSgp.get(c.sgp_plano_id) ?? null : null,
            pop_id: vendedor?.pop_id ?? popPorCidade.get(cliente.cidade ?? "") ?? null,
            valor_mensalidade: c.valor_mensalidade,
            valor_instalacao: c.valor_instalacao,
            status: statusNovo,
            origem_cadastro: origem(c.origem_cadastro_sgp),
            data_venda: c.data_venda,
            data_assinatura: dataAssinatura,
            data_ativacao: dataAtivacao,
            data_cancelamento: dataCancelamento,
            motivo_cancelamento: c.motivo_cancelamento,
            sync_updated_at: new Date().toISOString(),
          });
        }
        for (let i = 0; i < linhas.length; i += 500) {
          const { error } = await admin
            .from("contratos")
            .upsert(linhas.slice(i, i + 500), { onConflict: "sgp_contrato_id" });
          if (error) pendencias.push(`lote de contratos: ${error.message}`);
          else gravados += Math.min(500, linhas.length - i);
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
        const sgpIds = [...new Set(titulos.map((t) => t.sgp_contrato_id))];
        const contratoPorSgp = new Map<string, string>();
        for (let i = 0; i < sgpIds.length; i += 400) {
          const { data: parte } = await admin
            .from("contratos")
            .select("id, sgp_contrato_id")
            .in("sgp_contrato_id", sgpIds.slice(i, i + 400));
          for (const c of parte ?? []) contratoPorSgp.set(c.sgp_contrato_id as string, c.id as string);
        }
        const linhas = titulos
          .filter((t) => contratoPorSgp.has(t.sgp_contrato_id))
          .map((t) => ({
            sgp_titulo_id: t.sgp_titulo_id,
            contrato_id: contratoPorSgp.get(t.sgp_contrato_id)!,
            numero_parcela: t.numero_parcela,
            valor: t.valor,
            vencimento: t.vencimento,
            data_pagamento: t.data_pagamento,
            status: t.status,
            sync_updated_at: new Date().toISOString(),
          }));
        for (let i = 0; i < linhas.length; i += 500) {
          const { error } = await admin
            .from("titulos")
            .upsert(linhas.slice(i, i + 500), { onConflict: "sgp_titulo_id" });
          if (!error) gravados += Math.min(500, linhas.length - i);
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

  // ---------- assinaturas eletrônicas (tags do contrato no SGP) ----------
  // Critério D5: comissão só libera com Termo de Adesão + Fidelidade assinados.
  // Verifica os contratos recentes ainda não confirmados, em lotes por execução.
  if (sgp.modo === "real") {
    const run = await iniciarRun(admin, "assinaturas");
    try {
      const corte = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
      const { data: pendentes } = await admin
        .from("contratos")
        .select("id, sgp_contrato_id, data_assinatura, data_venda")
        .neq("status", "cancelado")
        .gte("data_venda", corte)
        .or("termo_adesao_assinado.is.null,termo_adesao_assinado.eq.false,fidelidade_assinada.is.null,fidelidade_assinada.eq.false")
        .order("data_venda", { ascending: false })
        .limit(25);

      let verificados = 0;
      const { lerConfigSgp } = await import("@/lib/integracoes/config");
      const cfg = await lerConfigSgp();
      const base = (cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");
      for (const c of pendentes ?? []) {
        try {
          const resposta = await fetch(`${base}/api/ura/consultacliente/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: cfg.token, app: cfg.app, contrato: Number(c.sgp_contrato_id) }),
            signal: AbortSignal.timeout(20_000),
            cache: "no-store",
          });
          if (!resposta.ok) continue;
          const detalhe = (await resposta.json()) as {
            contratos?: { contratoId?: number; tags?: { tag?: string }[] }[];
          };
          const contrato =
            (detalhe.contratos ?? []).find((x) => String(x.contratoId) === c.sgp_contrato_id) ??
            (detalhe.contratos ?? [])[0];
          if (!contrato) continue;
          const tags = (contrato.tags ?? []).map((t) => (t.tag ?? "").toUpperCase());
          const adesao = tags.some((t) => t.includes("ADESÃO") || t.includes("ADESAO"));
          const fidelidade = tags.some((t) => t.includes("FIDELIDADE"));
          await admin
            .from("contratos")
            .update({
              termo_adesao_assinado: adesao,
              fidelidade_assinada: fidelidade,
              assinaturas_verificadas_em: new Date().toISOString(),
              // esteira real: sem as duas assinaturas, o contrato volta a
              // "pendente de assinatura"; com as duas, mantém/assume a data
              data_assinatura:
                adesao && fidelidade
                  ? c.data_assinatura ?? new Date().toISOString().slice(0, 10)
                  : null,
            })
            .eq("id", c.id);
          verificados += 1;
        } catch {
          // contrato inacessível nesta rodada: tenta na próxima
        }
      }
      await finalizarRun(admin, run, "sucesso", verificados);
      execucoes.push({ entidade: "assinaturas" as Entidade, registros: verificados, status: "sucesso" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finalizarRun(admin, run, "erro", 0, msg);
      execucoes.push({ entidade: "assinaturas" as Entidade, registros: 0, status: "erro", erro: msg });
    }
  }

  // ---------- ordens de instalação (Operacional / Instalação de equipamento) ----------
  // O responsável atribuído na ocorrência é o start dos contratos prontos para
  // o operacional (José Galdino / Aline Santos; Railson Costa em VTX). A API
  // só expõe OS aberta — quando entra em execução, marcamos saiu_da_fila.
  if (sgp.modo === "real") {
    const run = await iniciarRun(admin, "os_instalacao");
    try {
      // A aproximação D3 marca todo contrato como ativo/ativado, então o
      // status local não diz quem espera instalação — a OS aberta diz.
      // Candidatos: vendas recentes (OS nova pode surgir) + contratos que já
      // têm OS aberta (para detectar agendamento/execução).
      const corte = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
      const [{ data: recentes }, { data: comOsAberta }] = await Promise.all([
        admin
          .from("contratos")
          .select("id, sgp_contrato_id")
          .neq("status", "cancelado")
          .gte("data_venda", corte)
          .order("os_verificado_em", { ascending: true, nullsFirst: true })
          .limit(15),
        admin
          .from("os_instalacao")
          .select("contrato_id, contratos!inner(id, sgp_contrato_id)")
          .eq("situacao", "aberta")
          .limit(10),
      ]);
      const vistos = new Set<string>();
      const candidatos: { id: string; sgp_contrato_id: string }[] = [];
      for (const c of [
        ...(recentes ?? []),
        ...((comOsAberta ?? []).map((o) => o.contratos) as unknown as { id: string; sgp_contrato_id: string }[]),
      ]) {
        if (!c || vistos.has(c.id)) continue;
        vistos.add(c.id);
        candidatos.push(c);
        if (candidatos.length >= 20) break;
      }

      const { lerConfigSgp } = await import("@/lib/integracoes/config");
      const cfg = await lerConfigSgp();
      const base = (cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");
      let gravadas = 0;
      for (const c of candidatos ?? []) {
        try {
          const resposta = await fetch(`${base}/api/os/list/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: cfg.token, app: cfg.app, contrato: Number(c.sgp_contrato_id) }),
            signal: AbortSignal.timeout(20_000),
            cache: "no-store",
          });
          if (!resposta.ok) continue;
          const lista = (await resposta.json()) as {
            os_id?: number;
            os_protocolo?: string;
            os_setor?: string;
            os_motivo_descricao?: string;
            os_tecnico_responsavel?: string;
            os_data_agendamento?: string | null;
            os_data_cadastro?: string | null;
          }[];
          const instalacao = (Array.isArray(lista) ? lista : []).filter(
            (os) =>
              (os.os_setor ?? "").toLowerCase().includes("operacional") &&
              (os.os_motivo_descricao ?? "").toLowerCase().includes("instala")
          );
          const abertasIds = instalacao.map((os) => String(os.os_id));
          for (const os of instalacao) {
            await admin.from("os_instalacao").upsert(
              {
                sgp_os_id: String(os.os_id),
                contrato_id: c.id,
                sgp_contrato_id: c.sgp_contrato_id,
                protocolo: os.os_protocolo ?? null,
                motivo: os.os_motivo_descricao ?? null,
                setor: os.os_setor ?? null,
                responsavel: os.os_tecnico_responsavel?.trim() || null,
                agendamento: os.os_data_agendamento || null,
                os_cadastrada_em: os.os_data_cadastro || null,
                situacao: "aberta",
                visto_em: new Date().toISOString(),
              },
              { onConflict: "sgp_os_id" }
            );
            gravadas += 1;
          }
          // OS que sumiu da listagem = entrou em execução / finalizou
          let fila = admin
            .from("os_instalacao")
            .update({ situacao: "saiu_da_fila", visto_em: new Date().toISOString() })
            .eq("contrato_id", c.id)
            .eq("situacao", "aberta");
          if (abertasIds.length > 0)
            fila = fila.not("sgp_os_id", "in", `(${abertasIds.map((x) => `"${x}"`).join(",")})`);
          await fila;
          await admin
            .from("contratos")
            .update({ os_verificado_em: new Date().toISOString() })
            .eq("id", c.id);
        } catch {
          // contrato inacessível nesta rodada: tenta na próxima
        }
      }
      await finalizarRun(admin, run, "sucesso", gravadas);
      execucoes.push({ entidade: "os_instalacao" as Entidade, registros: gravadas, status: "sucesso" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finalizarRun(admin, run, "erro", 0, msg);
      execucoes.push({ entidade: "os_instalacao" as Entidade, registros: 0, status: "erro", erro: msg });
    }
  }

  // ---- vendedor via painel do SGP (decisão A): contratos sem vendedor ----
  // A URA não expõe o campo; o leitor de sessão extrai da página do serviço e
  // atribui pelo sgp_login (com aprendizado). 15 por rodada — os novos entram
  // primeiro; o histórico é coberto aos poucos, sync a sync.
  if (sgp.modo === "real") {
    const run = await iniciarRun(admin, "vendedor_painel");
    try {
      const { identificarVendedoresPainel } = await import("@/lib/sgp/painel");
      const r = await identificarVendedoresPainel(15);
      if (!r.ok) throw new Error(r.erro ?? "leitor do painel falhou");
      if (r.semMapeamento.length > 0) {
        console.warn("vendedor_painel sem mapeamento:", r.semMapeamento.join(" | "));
      }
      await finalizarRun(admin, run, "sucesso", r.atribuidos);
      execucoes.push({
        entidade: "vendedor_painel" as Entidade,
        registros: r.atribuidos,
        status: "sucesso",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finalizarRun(admin, run, "erro", 0, msg);
      execucoes.push({ entidade: "vendedor_painel" as Entidade, registros: 0, status: "erro", erro: msg });
    }
  }

  // avança o cursor da varredura para a próxima execução
  if (sgp.modo === "real") {
    const progresso = (sgp as unknown as { progresso: { proximoOffset: number } | null }).progresso;
    if (progresso) {
      const atual = (cfgBruta?.config as Record<string, unknown>) ?? {};
      await admin.from("integracoes_config").upsert({
        sistema: "sgp",
        config: { ...atual, scan_offset: progresso.proximoOffset },
        atualizado_em: new Date().toISOString(),
      });
    }
  }

  return { modo: sgp.modo, execucoes };
}
