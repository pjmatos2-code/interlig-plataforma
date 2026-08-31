import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { SessaoSz, lerCredenciaisSz } from "@/lib/sz/sessao";
import { carregarDialogo, type Conversa } from "@/lib/sz/conversas";

/**
 * Robô do canal de cancelamento (SZ → casos de retenção).
 *
 * Toda conversa que entra na campanha "Cancelamento Altamira" vira um caso —
 * é isso que torna o denominador da taxa auditável: a agente não escolhe o
 * que registra. Dedup por protocolo e por telefone (15 dias); reincidência
 * marcada por telefone; contrato casado por CPF/telefone na nossa base.
 *
 * O id da campanha fica em integracoes_config.szchat.campanha_retencao —
 * descoberto em 30/08 pelas conversas da Sandryne (65d4f9c6c8d5e2eb380ac588).
 */

const CAMPANHA_RETENCAO_PADRAO = "65d4f9c6c8d5e2eb380ac588";

const soDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");

export type ResultadoRoboRetencao = {
  ok: boolean;
  lidas: number;
  criados: number;
  reincidentes: number;
  erro?: string;
};

async function listarConversasCancelamento(
  sz: SessaoSz,
  campanha: string,
  inicio: string,
  fim: string
): Promise<Conversa[]> {
  const achadas: Conversa[] = [];
  const dateParam = encodeURIComponent(JSON.stringify({ start: inicio, end: fim }));
  for (let p = 1; p <= 30; p++) {
    const r = await sz.api(
      `/reports/messages/filter?page=${p}&channel=&contact=&protocol=&agent=&contactName=&attendance=&platform_id=&options_conversations=all&view_conversation=default&data_privacy=hidden&typeStatus=all&copilot_score=&attendance_classification=&closing_reason=&finalCampaign=&finalAgent=&date=${dateParam}`
    );
    if (!r.ok) break;
    const j = (await r.json()) as { data?: Record<string, unknown>[]; has_next?: boolean };
    for (const c of j.data ?? []) {
      if (String(c.campaign_id ?? "") !== campanha) continue;
      achadas.push({
        id: String(c._id),
        equipe: "Cancelamento Altamira",
        nome: String(c.name ?? "Sem nome"),
        telefone: (c.platform_id as string) || null,
        agente: (c.agent as { name?: string } | undefined)?.name ?? null,
        protocolo: (c.protocol as string) || null,
        quando: (c.dateFormatted as string) || null,
        dialogo: [],
      });
    }
    if (!j.has_next) break;
  }
  return achadas;
}

export async function rodarRoboRetencao(dia?: string): Promise<ResultadoRoboRetencao> {
  const cred = await lerCredenciaisSz();
  if (!cred) return { ok: false, lidas: 0, criados: 0, reincidentes: 0, erro: "credencial SZ não configurada" };

  const admin = criarClienteAdmin();
  const alvo =
    dia ??
    new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santarem" }).format(new Date());

  try {
    const { data: cfgRow } = await admin
      .from("integracoes_config")
      .select("config")
      .eq("sistema", "szchat")
      .maybeSingle();
    const campanha =
      ((cfgRow?.config as Record<string, unknown>)?.campanha_retencao as string) ||
      CAMPANHA_RETENCAO_PADRAO;

    const sz = new SessaoSz(cred);
    await sz.login();
    const conversas = await listarConversasCancelamento(sz, campanha, alvo, alvo);

    // agente responsável: quem atendeu no SZ, se for do setor retenção
    const { data: agentes } = await admin
      .from("vendedores")
      .select("sgp_login, nome")
      .eq("setor", "retencao")
      .eq("ativo", true);
    const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const loginDe = (nomeSz: string | null) => {
      if (!nomeSz) return (agentes ?? [])[0]?.sgp_login ?? null;
      const primeiro = semAcento(nomeSz).split(/\s+/)[0];
      const a = (agentes ?? []).find((x) => semAcento(x.nome).includes(primeiro));
      return (a?.sgp_login ?? (agentes ?? [])[0]?.sgp_login ?? null) as string | null;
    };

    let criados = 0;
    let reincidentes = 0;

    for (const c of conversas) {
      // dedup por protocolo (índice único) e por telefone recente
      if (c.protocolo) {
        const { data: jaExiste } = await admin
          .from("casos_retencao")
          .select("id")
          .eq("protocolo_sz", c.protocolo)
          .maybeSingle();
        if (jaExiste) continue;
      }
      const tel = soDigitos(c.telefone);
      let casoAnterior: { id: string; criado_em: string } | null = null;
      if (tel) {
        const { data: ants } = await admin
          .from("casos_retencao")
          .select("id, criado_em, telefone")
          .order("criado_em", { ascending: false })
          .limit(1000);
        casoAnterior =
          ((ants ?? []).find((a) => soDigitos(a.telefone) === tel) as {
            id: string;
            criado_em: string;
          }) ?? null;
        // mesmo telefone nos últimos 15 dias = a MESMA solicitação continuando
        if (
          casoAnterior &&
          Date.now() - Date.parse(casoAnterior.criado_em) < 15 * 86_400_000
        )
          continue;
      }

      // transcript: tenta casar o contrato por CPF citado na conversa
      await carregarDialogo(sz, c, { inicio: alvo, fim: alvo });
      const texto = c.dialogo.map((m) => m.texto).join(" ");
      const cpf = (texto.match(/\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/) ?? [])[1]?.replace(/\D/g, "");

      let contratoId: string | null = null;
      let sgpContratoId: string | null = null;
      let vtv = 0;
      let clienteNome = c.nome;

      const casar = async (col: string, valor: string) => {
        const { data: cli } = await admin
          .from("clientes")
          .select("id, nome")
          .eq(col, valor)
          .maybeSingle();
        if (!cli) return false;
        clienteNome = (cli.nome as string) || clienteNome;
        const { data: ct } = await admin
          .from("contratos")
          .select("id, sgp_contrato_id, valor_mensalidade, status, planos(valor_referencia)")
          .eq("cliente_id", cli.id)
          .neq("status", "cancelado")
          .order("data_venda", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!ct) return false;
        contratoId = ct.id as string;
        sgpContratoId = (ct.sgp_contrato_id as string) ?? null;
        const ref = Number(
          (ct.planos as unknown as { valor_referencia: number } | null)?.valor_referencia ?? 0
        );
        vtv = ref > 0 ? ref : Number(ct.valor_mensalidade ?? 0);
        return true;
      };
      if (cpf) await casar("cpf", cpf);
      // sem CPF: tenta pelo telefone do WhatsApp (últimos 8 dígitos)
      if (!contratoId && tel.length >= 8) {
        const { data: clis } = await admin
          .from("clientes")
          .select("id, nome, telefone")
          .not("telefone", "is", null)
          .limit(20000);
        const suf = tel.slice(-8);
        const cli = (clis ?? []).find((x) => soDigitos(x.telefone).endsWith(suf));
        if (cli) await casar("id", cli.id as string);
      }

      const { error } = await admin.from("casos_retencao").insert({
        origem: "sz_auto",
        protocolo_sz: c.protocolo,
        telefone: c.telefone,
        cliente_nome: clienteNome,
        contrato_id: contratoId,
        sgp_contrato_id: sgpContratoId,
        valor_mensal: vtv,
        agente_login: loginDe(c.agente),
        etapa: "novo",
        reincidente_de: casoAnterior?.id ?? null,
      });
      if (!error) {
        criados++;
        if (casoAnterior) reincidentes++;
      }
    }

    return { ok: true, lidas: conversas.length, criados, reincidentes };
  } catch (e) {
    return { ok: false, lidas: 0, criados: 0, reincidentes: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}
