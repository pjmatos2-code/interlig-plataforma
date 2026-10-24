import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarBase } from "../dados/carregar";
import { calcularLinha, calcularTotais, indexar, ordenarRanking } from "../dados/calcular";
import { resolverPeriodoPerf } from "../periodo";
import { perfilAbreModulo } from "../escopo-regras";
import { ESCOPO_SISTEMA } from "../sistema";
import { gerarAlertas, type AlertaCandidato } from "./regras";

/**
 * Central de alertas — rotina (24/10/2026). Avalia o mês corrente da
 * empresa inteira, cria/atualiza alertas agrupados pela chave, resolve
 * sozinha os que deixaram de valer e avisa (sino da plataforma) só os
 * CRÍTICOS novos, para o vendedor e a coordenação, com teto diário.
 * Resolvido à mão não renasce antes de 24 h, mesmo que a condição persista.
 */

const somaDias = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

export async function rodarAlertas(opts: { notificar?: boolean } = {}) {
  const admin = criarClienteAdmin();
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const periodo = resolverPeriodoPerf({ periodo: "mes" }, hoje);
  const base = await carregarBase(ESCOPO_SISTEMA, periodo);
  if (!base.cfg.modulo_ativo) return { candidatos: 0, criados: 0, atualizados: 0, resolvidos: 0, notificados: 0 };
  const idx = indexar(base);
  const avaliados = base.vendedores.filter((v) => base.cfg.setores.includes(v.setor ?? ""));
  const linhas = ordenarRanking(avaliados.map((v) => calcularLinha(base, idx, v, periodo.de, periodo.ate)));
  const anteriores = new Map(avaliados.map((v) => [v.id, calcularLinha(base, idx, v, periodo.deAnterior, periodo.ateAnterior)]));
  const semana7 = new Map(avaliados.map((v) => [v.id, calcularLinha(base, idx, v, somaDias(hoje, -6), hoje)]));
  const base30 = new Map(avaliados.map((v) => [v.id, calcularLinha(base, idx, v, somaDias(hoje, -36), somaDias(hoje, -7))]));
  const totais = calcularTotais(base, idx, linhas, periodo.de, periodo.ate, { incluirSemDono: true });
  const candidatos = gerarAlertas(base, idx, { linhas, totais, de: periodo.de, ate: periodo.ate }, anteriores, semana7, base30);

  const { data: vivos } = await admin
    .from("alertas_comerciais")
    .select("id, chave, status, silenciado_ate, ocorrencias, origem")
    .in("status", ["aberto", "reconhecido", "silenciado"]);
  const vivoPorChave = new Map((vivos ?? []).map((v) => [v.chave as string, v]));
  const desde24h = new Date(Date.now() - 86_400_000).toISOString();
  const { data: resolvidosRecentes } = await admin
    .from("alertas_comerciais")
    .select("chave, ocorrencias, resolvido_por, resolvido_em")
    .eq("status", "resolvido")
    .gte("resolvido_em", new Date(Date.now() - 60 * 86_400_000).toISOString());
  const ultimoResolvido = new Map<string, { ocorrencias: number; manual: boolean; em: string }>();
  for (const r of resolvidosRecentes ?? []) {
    const atual = ultimoResolvido.get(r.chave as string);
    if (!atual || (r.resolvido_em as string) > atual.em) ultimoResolvido.set(r.chave as string, { ocorrencias: Number(r.ocorrencias), manual: Boolean(r.resolvido_por), em: r.resolvido_em as string });
  }

  const agora = new Date().toISOString();
  let criados = 0;
  let atualizados = 0;
  const novosCriticos: AlertaCandidato[] = [];
  const chavesAtuais = new Set(candidatos.map((c) => c.chave));
  for (const c of candidatos) {
    const vivo = vivoPorChave.get(c.chave);
    if (vivo) {
      const reabrir = vivo.status === "silenciado" && vivo.silenciado_ate && (vivo.silenciado_ate as string) < agora;
      await admin
        .from("alertas_comerciais")
        .update({ ultima_em: agora, detalhe: c.detalhe, titulo: c.titulo, evidencias: c.evidencias, ...(reabrir ? { status: "aberto", silenciado_ate: null } : {}) })
        .eq("id", vivo.id);
      if (reabrir) await admin.from("alertas_comerciais_eventos").insert({ alerta_id: vivo.id, evento: "reaberto", dados: { motivo: "fim do silêncio" } });
      atualizados++;
      continue;
    }
    const anterior = ultimoResolvido.get(c.chave);
    if (anterior?.manual && anterior.em > desde24h) continue; // resolvido à mão há pouco
    const { data: novo, error } = await admin
      .from("alertas_comerciais")
      .insert({ ...c, status: "aberto", ocorrencias: (anterior?.ocorrencias ?? 0) + 1, primeira_em: agora, ultima_em: agora })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") continue; // outra execução criou ao mesmo tempo
      throw new Error(`criar alerta ${c.chave}: ${error.message}`);
    }
    await admin.from("alertas_comerciais_eventos").insert({ alerta_id: novo.id, evento: anterior ? "repetido" : "criado", dados: { ocorrencia: (anterior?.ocorrencias ?? 0) + 1 } });
    criados++;
    if (c.categoria === "critico") novosCriticos.push(c);
  }

  // condição deixou de valer → resolve sozinho (com registro)
  let resolvidos = 0;
  for (const v of vivos ?? []) {
    if (chavesAtuais.has(v.chave as string)) continue;
    await admin.from("alertas_comerciais").update({ status: "resolvido", resolvido_em: agora }).eq("id", v.id);
    await admin.from("alertas_comerciais_eventos").insert({ alerta_id: v.id, evento: "resolvido_automaticamente", dados: { motivo: "a condição deixou de existir" } });
    resolvidos++;
  }

  // aviso no sino: só críticos novos, para vendedor + coordenação (se abrem o módulo), com teto diário
  let notificados = 0;
  if (opts.notificar !== false && base.cfg.alertas.notificar_criticos && novosCriticos.length) {
    const inicioDia = `${hoje}T00:00:00-03:00`;
    const { count } = await admin.from("notificacoes").select("id", { count: "exact", head: true }).eq("tipo", "alerta_comercial").gte("criado_em", inicioDia);
    let restante = Math.max(0, base.cfg.alertas.max_notificacoes_dia - (count ?? 0));
    const { data: usuarios } = await admin.from("usuarios").select("id, vendedor_id, ativo, perfil").eq("ativo", true);
    const usuarioDoVendedor = new Map((usuarios ?? []).filter((u) => u.vendedor_id).map((u) => [u.vendedor_id as string, u.id as string]));
    // só avisa quem abre o módulo (o aviso leva para dentro dele); enquanto for só o
    // administrador, vendedor e coordenação não recebem nada
    const perfilDe = new Map((usuarios ?? []).map((u) => [u.id as string, u.perfil as string]));
    const abre = (usuarioId: string) => perfilAbreModulo(perfilDe.get(usuarioId) ?? "", base.cfg.acesso.papeis_modulo);
    for (const c of novosCriticos) {
      if (restante <= 0) break;
      const v = base.vendedores.find((x) => x.id === c.vendedor_id);
      const destinos = [...new Set([c.vendedor_id ? usuarioDoVendedor.get(c.vendedor_id) : undefined, v?.coordenador_id ?? undefined].filter((x): x is string => Boolean(x) && abre(x as string)))];
      for (const d of destinos) {
        if (restante <= 0) break;
        await admin.from("notificacoes").insert({
          destinatario_id: d,
          tipo: "alerta_comercial",
          titulo: c.titulo,
          descricao: c.detalhe,
          link: c.ticket_id ? `/crm/${c.ticket_id}` : "/performance/alertas",
        });
        restante--;
        notificados++;
      }
      if (destinos.length) await admin.from("alertas_comerciais").update({ notificado_em: agora }).eq("chave", c.chave).eq("status", "aberto");
    }
  }
  return { candidatos: candidatos.length, criados, atualizados, resolvidos, notificados };
}
