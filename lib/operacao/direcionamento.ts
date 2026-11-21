/**
 * Direcionamento ao gestor técnico (21/11/2026). Depois das assinaturas, a
 * ocorrência de instalação recebe o gestor da unidade no campo "Usuário
 * responsável" — é aí que ela fica apta para a operação, e é daí que conta o
 * prazo de 48 h até o contrato ficar ativo. O SGP só guarda essa hora no
 * registro de alterações da página da ocorrência:
 *
 *   20/11/2026 20:57:23 | usuário | IP | Ocorrência N. … alterada. … Usuário
 *   responsável: Alterado de para jose.galdino …
 *
 * Funções puras: recebem o HTML da página e devolvem a primeira vez que o
 * responsável foi preenchido.
 */

/** Só ocorrências criadas a partir daqui (decisão 21/11/2026: olhar o mês atual; o resto sobe depois). */
export const DIRECIONAMENTO_DESDE = "2026-11-01";
/**
 * Só instalação: no ensaio de 21/11/2026 as mudanças de endereço não recebem
 * o gestor no "Usuário responsável" (o registro não tem essa alteração).
 */
export const TIPOS_DIRECIONAMENTO = ["Operacional - Instalação equipamento"];

/**
 * Gestores técnicos das unidades (usuários do SGP): Altamira, Vitória do Xingu
 * e Brasil Novo. Vale a primeira vez que a ocorrência foi para um deles — no
 * ensaio, algumas passaram antes por outro usuário.
 */
export const GESTORES_TECNICOS = ["jose.galdino", "railson.costa", "aline.moraes"];
const ehGestor = (u: string | null | undefined) => GESTORES_TECNICOS.includes((u ?? "").trim().toLowerCase());

const ENTIDADES: Record<string, string> = {
  "&aacute;": "á", "&eacute;": "é", "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú",
  "&atilde;": "ã", "&otilde;": "õ", "&ccedil;": "ç", "&acirc;": "â", "&ecirc;": "ê", "&ocirc;": "ô",
  "&Aacute;": "Á", "&Eacute;": "É", "&Ccedil;": "Ç", "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'",
};
function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z#0-9]+;/g, (e) => ENTIDADES[e] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "20/11/2026 20:57:23" → ISO no fuso do SGP (Santarém, UTC−3). */
export function dataHoraSgp(t: string): string | null {
  const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? "00"}-03:00` : null;
}

export type Alteracao = { em: string; usuario: string; acao: string };

/** Linhas do registro de alterações (tabela "Data Cadastro | Usuário | IP | Ação"). */
export function registroDeAlteracoes(html: string): Alteracao[] {
  const saida: Alteracao[] = [];
  for (const t of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const tabela = t[0];
    const cab = [...tabela.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => texto(m[1]).toLowerCase());
    const iData = cab.findIndex((c) => c === "data cadastro");
    const iAcao = cab.findIndex((c) => c === "ação");
    const iUsu = cab.findIndex((c) => c === "usuário");
    if (iData < 0 || iAcao < 0) continue;
    for (const tr of tabela.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const tds = [...tr[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => texto(m[1]));
      const em = tds[iData] ? dataHoraSgp(tds[iData]) : null;
      if (!em) continue;
      saida.push({ em, usuario: iUsu >= 0 ? tds[iUsu] ?? "" : "", acao: tds[iAcao] ?? "" });
    }
  }
  return saida;
}

/** Para quem o responsável foi alterado nesta ação (null: a ação não preenche o responsável). */
export function responsavelPreenchido(acao: string): string | null {
  const m = acao.match(/Usu[aá]rio respons[aá]vel:\s*Alterado de\s*([^:]*?)\s*para\s*([\w.-]+)(?![\w.-]*:)/i);
  return m ? m[2] : null;
}

export type Direcionamento = { em: string; para: string; origem: "registro" | "abertura" };

/**
 * Primeira vez que o responsável passou a ser um gestor técnico. Sem essa
 * alteração no registro, mas com o gestor já na ocorrência, ele veio na
 * abertura: vale a hora de criação.
 */
export function direcionamentoDaPagina(html: string, fallback: { criadaEm: string; responsavel: string | null }): Direcionamento | null {
  const registro = registroDeAlteracoes(html);
  // sem o registro na página (leiaute mudou, página de erro): não conclui nada
  if (!registro.length) return null;
  const preenchimentos = registro
    .map((a) => ({ em: a.em, para: responsavelPreenchido(a.acao) }))
    .filter((a): a is { em: string; para: string } => ehGestor(a.para))
    .sort((a, b) => a.em.localeCompare(b.em));
  if (preenchimentos.length) return { ...preenchimentos[0], origem: "registro" };
  if (ehGestor(fallback.responsavel)) return { em: fallback.criadaEm, para: fallback.responsavel!.trim().toLowerCase(), origem: "abertura" };
  return null;
}
