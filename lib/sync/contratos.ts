/**
 * A data de venda que o sync grava no contrato.
 *
 * Normalmente é a data de cadastro do contrato no SGP. Em venda retomada
 * (18/11/2026) a gestão ajustou a data — o contrato foi cadastrado num mês e a
 * venda só fechou depois — e o sync não pode voltar para a do SGP a cada
 * passada. O que marca a venda retomada é venda_retomada_em preenchido.
 */
export function dataDaVenda(
  jaGravado: { data_venda: string; venda_retomada_em: string | null } | undefined,
  cadastroNoSgp: string
): string {
  return jaGravado?.venda_retomada_em ? jaGravado.data_venda : cadastroNoSgp;
}

const diasEntre = (deIso: string, ateIso: string) =>
  Math.round((Date.parse(`${ateIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`)) / 86_400_000);

/** Cadastro mais antigo que isto, chegando já cancelado, não foi cancelado hoje. */
export const DIAS_CANCELAMENTO_ANTIGO = 30;

/**
 * A data de cancelamento que o sync grava. A API do SGP não informa quando o
 * contrato foi cancelado, só que está cancelado.
 *
 * - Já havia data gravada: fica a gravada (a do relatório oficial de
 *   cancelados, ou o dia em que o sync percebeu).
 * - O contrato já estava na base e apareceu cancelado agora: vale hoje, o dia
 *   em que o sync percebeu.
 * - O contrato é novo na base e já chega cancelado, com cadastro antigo
 *   (18/11/2026): a plataforma nunca viu esse contrato — é cadastro que ficava
 *   de fora pela cidade. Ele não foi cancelado hoje; carimbar hoje jogaria
 *   cancelamentos de anos atrás no mês corrente. Sem a data real, vale a do
 *   cadastro, e a leitura do relatório de cancelados corrige se alcançar.
 */
export function dataDoCancelamento(
  jaGravado: { data_cancelamento: string | null } | undefined,
  doSgp: { data_cancelamento: string | null; data_venda: string },
  hoje: string
): string | null {
  if (!doSgp.data_cancelamento) return null;
  if (jaGravado?.data_cancelamento) return jaGravado.data_cancelamento;
  if (!jaGravado && diasEntre(doSgp.data_venda, hoje) > DIAS_CANCELAMENTO_ANTIGO) return doSgp.data_venda;
  return doSgp.data_cancelamento;
}
