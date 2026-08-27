import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { lerConfigSgp } from "@/lib/integracoes/config";

/**
 * Atualização sob demanda de UM contrato no SGP (botão "Atualizar do SGP" no
 * ticket): status Ativo/Inativo, assinaturas (tags do Termo de Adesão e do
 * Contrato de Fidelidade) e OS de instalação/agendamento — a mesma lógica das
 * fases do sync, escopada a um contrato, sem esperar o próximo ciclo.
 */

export type ResumoAtualizacao = {
  ok: boolean;
  erro?: string;
  statusSgp?: string;
  status?: string;
  termoAssinado?: boolean;
  fidelidadeAssinada?: boolean;
  osAbertas?: { protocolo: string | null; agendamento: string | null; responsavel: string | null }[];
  /** o que mudou nesta atualização (para o aviso na tela) */
  mudancas?: string[];
  /** coluna da esteira antes/depois — avisa quando o card vai se mover */
  colunaDe?: string;
  colunaPara?: string;
};

function colunaEsteira(assinado: boolean, status: string): string {
  if (status === "cancelado") return "fora da esteira (cancelado)";
  if (status === "suspenso") return "fora da esteira (suspenso)";
  if (status === "ativo") return "Instaladas no período";
  return assinado ? "Aguardando instalação" : "Pendente de assinatura";
}

export async function atualizarContratoDoSgp(contratoId: string): Promise<ResumoAtualizacao> {
  const admin = criarClienteAdmin();
  const cfg = await lerConfigSgp();
  const base = (cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");
  if (!base || !cfg.token || !cfg.app) return { ok: false, erro: "integração SGP não configurada" };

  const { data: c } = await admin
    .from("contratos")
    .select("id, sgp_contrato_id, status, data_assinatura, data_ativacao, data_cancelamento, termo_adesao_assinado, fidelidade_assinada")
    .eq("id", contratoId)
    .maybeSingle();
  if (!c?.sgp_contrato_id) return { ok: false, erro: "contrato sem vínculo com o SGP" };

  // ---------- detalhe do contrato (status + tags de assinatura) ----------
  const resposta = await fetch(`${base}/api/ura/consultacliente/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: cfg.token, app: cfg.app, contrato: Number(c.sgp_contrato_id) }),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!resposta.ok) return { ok: false, erro: `SGP respondeu ${resposta.status}` };
  const detalhe = (await resposta.json()) as {
    contratos?: {
      contratoId?: number;
      contratoStatusDisplay?: string;
      tags?: { tag?: string }[];
    }[];
  };
  const ct =
    (detalhe.contratos ?? []).find((x) => String(x.contratoId) === c.sgp_contrato_id) ??
    (detalhe.contratos ?? [])[0];
  if (!ct) return { ok: false, erro: "contrato não encontrado no SGP" };

  const statusSgp = (ct.contratoStatusDisplay ?? "").toUpperCase();
  const tags = (ct.tags ?? []).map((t) => (t.tag ?? "").toUpperCase());
  const adesao = tags.some((t) => t.includes("ADESÃO") || t.includes("ADESAO"));
  const fidelidade = tags.some((t) => t.includes("FIDELIDADE"));

  // mesmo mapa do sync (normalizarStatus / D12b)
  const statusNovo = c.data_cancelamento || statusSgp.includes("CANCEL")
    ? "cancelado"
    : statusSgp.includes("SUSPEN")
      ? "suspenso"
      : statusSgp.includes("INATIV")
        ? "aguardando_ativacao"
        : statusSgp.includes("ATIVO")
          ? "ativo"
          : (c.status as string);

  await admin
    .from("contratos")
    .update({
      status: statusNovo,
      // D12b: virou ativo sem data → carimba hoje; senão preserva
      data_ativacao:
        statusNovo === "ativo"
          ? (c.data_ativacao as string | null) ?? new Date().toISOString().slice(0, 10)
          : statusNovo === "aguardando_ativacao"
            ? null
            : (c.data_ativacao as string | null),
      termo_adesao_assinado: adesao,
      fidelidade_assinada: fidelidade,
      assinaturas_verificadas_em: new Date().toISOString(),
      data_assinatura:
        adesao && fidelidade
          ? (c.data_assinatura as string | null) ?? new Date().toISOString().slice(0, 10)
          : null,
    })
    .eq("id", c.id);

  // ---------- OS de instalação (agendamento/responsável) ----------
  const osAbertas: ResumoAtualizacao["osAbertas"] = [];
  try {
    const ros = await fetch(`${base}/api/os/list/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: cfg.token, app: cfg.app, contrato: Number(c.sgp_contrato_id) }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (ros.ok) {
      const lista = (await ros.json()) as {
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
        osAbertas.push({
          protocolo: os.os_protocolo ?? null,
          agendamento: os.os_data_agendamento || null,
          responsavel: os.os_tecnico_responsavel?.trim() || null,
        });
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
    }
  } catch {
    // OS indisponível não invalida a atualização do status/assinaturas
  }

  // ---------- o que mudou (aviso na tela) ----------
  const mudancas: string[] = [];
  if (adesao && c.termo_adesao_assinado !== true) mudancas.push("Termo de Adesão assinado ✓");
  if (fidelidade && c.fidelidade_assinada !== true) mudancas.push("Contrato de Fidelidade assinado ✓");
  if (!adesao && c.termo_adesao_assinado === true) mudancas.push("Termo de Adesão voltou a pendente ✗");
  if (!fidelidade && c.fidelidade_assinada === true) mudancas.push("Fidelidade voltou a pendente ✗");
  if (statusNovo !== (c.status as string))
    mudancas.push(`serviço: ${(c.status as string).replace(/_/g, " ")} → ${statusNovo.replace(/_/g, " ")}`);
  const agendada = osAbertas.find((o) => o.agendamento);
  if (agendada?.agendamento) {
    const dt = new Date(agendada.agendamento).toLocaleString("pt-BR", {
      timeZone: "America/Santarem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    mudancas.push(`instalação agendada para ${dt}${agendada.responsavel ? ` (${agendada.responsavel})` : ""}`);
  }

  const assinadoAntes = (c.data_assinatura as string | null) != null;
  const assinadoDepois = adesao && fidelidade;
  const colunaDe = colunaEsteira(assinadoAntes, c.status as string);
  const colunaPara = colunaEsteira(assinadoDepois, statusNovo);

  return {
    ok: true,
    statusSgp: ct.contratoStatusDisplay ?? "—",
    status: statusNovo,
    termoAssinado: adesao,
    fidelidadeAssinada: fidelidade,
    osAbertas,
    mudancas,
    colunaDe,
    colunaPara,
  };
}
