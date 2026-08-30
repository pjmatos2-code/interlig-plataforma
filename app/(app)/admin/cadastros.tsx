"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  criarUsuario,
  alternarUsuario,
  definirAgentesCoordenador,
  salvarPlanosExterna,
  salvarPrecoPlano,
  salvarOrigem,
  excluirOrigem,
  salvarAtendente,
  excluirAtendente,
  salvarEquipe,
  alternarEquipe,
  type EstadoAdmin,
} from "./acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ROTULO_ORIGEM, ROTULO_PERFIL, exigeVinculoAgente, type CategoriaOrigem, type Perfil } from "@/lib/tipos";
import { EditarUsuario } from "@/components/admin/editar-usuario";

const inicial: EstadoAdmin = {};
const selectCls = "flex h-10 rounded-md border border-input bg-background px-3 text-sm";

function BotaoSalvar({ rotulo = "Salvar" }: { rotulo?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Button>
  );
}

function Mensagem({ estado }: { estado: EstadoAdmin }) {
  if (estado.erro)
    return <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{estado.erro}</p>;
  if (estado.ok)
    return <p className="rounded-md bg-farol-verde/10 px-3 py-2 text-sm text-farol-verde">Salvo.</p>;
  return null;
}

function BotaoAlternar({
  ativo,
  acao,
}: {
  ativo: boolean;
  acao: () => Promise<EstadoAdmin>;
}) {
  const router = useRouter();
  const [aguardando, setAguardando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={aguardando}
        onClick={async () => {
          setAguardando(true);
          const r = await acao();
          setErro(r.erro ?? null);
          setAguardando(false);
          router.refresh();
        }}
      >
        {ativo ? "Desativar" : "Reativar"}
      </Button>
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </>
  );
}

// ---------------------------------------------------------------------------
export function GestaoUsuarios({
  usuarios,
  pops,
  vendedoras,
}: {
  usuarios: {
    id: string; nome: string; email: string; perfil: Perfil; ativo: boolean;
    pop: string | null; vendedora: string | null;
    popId: string | null; vendedorId: string | null;
  }[];
  pops: { id: string; nome: string }[];
  vendedoras: { id: string; nome: string }[];
}) {
  const [estado, acao] = useFormState(criarUsuario, inicial);
  const [perfil, setPerfil] = useState<Perfil>("vendedora");

  return (
    <div className="space-y-4">
      <form action={acao} className="grid gap-3 lg:grid-cols-6" key={estado.ok ? Date.now() : "u"}>
        <Input name="nome" placeholder="Nome completo" required className="lg:col-span-2" />
        <Input name="email" type="email" placeholder="e-mail" required />
        <Input name="senha" type="text" placeholder="senha provisória (8+)" required />
        <select name="perfil" value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)} className={selectCls}>
          <option value="vendedora">{ROTULO_PERFIL.vendedora}</option>
          <option value="vendedora_externa">{ROTULO_PERFIL.vendedora_externa}</option>
          <option value="agente_corporativo">{ROTULO_PERFIL.agente_corporativo}</option>
          <option value="agente_atendimento">{ROTULO_PERFIL.agente_atendimento}</option>
          <option value="supervisor">{ROTULO_PERFIL.supervisor}</option>
          <option value="financeiro">{ROTULO_PERFIL.financeiro}</option>
          <option value="gestor">{ROTULO_PERFIL.gestor}</option>
        </select>
        {perfil === "supervisor" && (
          <select name="pop_id" className={selectCls} required>
            <option value="">POP…</option>
            {pops.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        )}
        {exigeVinculoAgente(perfil) && (
          <select name="vendedor_id" className={selectCls} required>
            <option value="">Vendedora do SGP…</option>
            {vendedoras.map((v) => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </select>
        )}
        <BotaoSalvar rotulo="Convidar" />
      </form>
      <Mensagem estado={estado} />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">E-mail</th>
              <th className="px-3 py-2 font-medium">Perfil</th>
              <th className="px-3 py-2 font-medium">Vínculo</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{u.nome}</td>
                <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                <td className="px-3 py-2">{ROTULO_PERFIL[u.perfil]}</td>
                <td className="px-3 py-2 text-muted-foreground">{u.vendedora ?? u.pop ?? "—"}</td>
                <td className="px-3 py-2">
                  {u.ativo ? <Badge variant="verde">ativo</Badge> : <Badge variant="outline">inativo</Badge>}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <EditarUsuario
                      usuario={{
                        id: u.id, nome: u.nome, email: u.email, perfil: u.perfil,
                        vendedorId: u.vendedorId, popId: u.popId,
                      }}
                      pops={pops}
                      vendedoras={vendedoras}
                    />
                    <BotaoAlternar ativo={u.ativo} acao={() => alternarUsuario(u.id, !u.ativo)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Sem autocadastro (PRD seção 2): informe a senha provisória à pessoa e peça para trocá-la.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function GestaoOrigens({
  origens,
}: {
  origens: { id: string; valor_sgp: string; categoria: CategoriaOrigem }[];
}) {
  const [estado, acao] = useFormState(salvarOrigem, inicial);
  const router = useRouter();

  return (
    <div className="space-y-3">
      <form action={acao} className="flex flex-wrap gap-2" key={estado.ok ? Date.now() : "o"}>
        <Input name="valor_sgp" placeholder="Valor como vem do SGP (ex.: PAP)" className="max-w-xs" required />
        <select name="categoria" className={selectCls}>
          {(Object.keys(ROTULO_ORIGEM) as CategoriaOrigem[]).map((c) => (
            <option key={c} value={c}>{ROTULO_ORIGEM[c]}</option>
          ))}
        </select>
        <BotaoSalvar />
      </form>
      <Mensagem estado={estado} />
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <tbody>
            {origens.map((o) => (
              <tr key={o.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{o.valor_sgp}</td>
                <td className="px-3 py-2">→ {ROTULO_ORIGEM[o.categoria]}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={async () => {
                      if (!confirm(`Excluir o de/para "${o.valor_sgp}"?`)) return;
                      await excluirOrigem(o.id);
                      router.refresh();
                    }}
                  >
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function GestaoSzChat({
  atendentes,
  equipes,
  vendedoras,
  pops,
}: {
  atendentes: { id: string; sz_atendente_id: string; sz_atendente_nome: string | null; vendedora: string }[];
  equipes: { id: string; nome: string; ativo: boolean; pop: string | null }[];
  vendedoras: { id: string; nome: string }[];
  pops: { id: string; nome: string }[];
}) {
  const [estadoA, acaoA] = useFormState(salvarAtendente, inicial);
  const [estadoE, acaoE] = useFormState(salvarEquipe, inicial);
  const router = useRouter();

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-3">
        <p className="text-sm font-medium">Atendente do SZ ↔ vendedora</p>
        <form action={acaoA} className="flex flex-wrap gap-2" key={estadoA.ok ? Date.now() : "a"}>
          <Input name="sz_atendente_id" placeholder="ID no SZ (ex.: SZ-AT-009)" className="max-w-[11rem]" required />
          <Input name="sz_atendente_nome" placeholder="nome (opcional)" className="max-w-[11rem]" />
          <select name="vendedor_id" className={selectCls} required>
            <option value="">Vendedora…</option>
            {vendedoras.map((v) => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </select>
          <BotaoSalvar />
        </form>
        <Mensagem estado={estadoA} />
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <tbody>
              {atendentes.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{a.sz_atendente_id}</td>
                  <td className="px-3 py-2 text-muted-foreground">{a.sz_atendente_nome ?? ""}</td>
                  <td className="px-3 py-2">→ {a.vendedora}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (!confirm("Excluir o mapeamento?")) return;
                        await excluirAtendente(a.id);
                        router.refresh();
                      }}
                    >
                      Excluir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">
          Equipes que geram ticket (D1 — nome EXATO da equipe no SZ Chat)
        </p>
        <form action={acaoE} className="flex flex-wrap gap-2" key={estadoE.ok ? Date.now() : "e"}>
          <Input name="nome" placeholder='ex.: "Comercial Altamira"' className="max-w-[14rem]" required />
          <select name="pop_id" className={selectCls}>
            <option value="">POP (opcional)…</option>
            {pops.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          <BotaoSalvar rotulo="Habilitar" />
        </form>
        <Mensagem estado={estadoE} />
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <tbody>
              {equipes.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{e.nome}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.pop ?? "sem POP"}</td>
                  <td className="px-3 py-2">
                    {e.ativo ? <Badge variant="verde">gera ticket</Badge> : <Badge variant="outline">ignorada</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <BotaoAlternar ativo={e.ativo} acao={() => alternarEquipe(e.id, !e.ativo)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coordenações — define as agentes sob cada coordenador (escopo por agente).
// O coordenador passa a ver só as ações dessas agentes em todos os módulos
// (exceção: na Venda Externa vê todos os tickets de PAP).
// ---------------------------------------------------------------------------
type Coordenador = { id: string; nome: string; email: string };
type VendedoraCoord = { id: string; nome: string; coordenador_id: string | null };

function FormCoordenacao({
  coordenador,
  vendedoras,
}: {
  coordenador: Coordenador;
  vendedoras: VendedoraCoord[];
}) {
  const [estado, acao] = useFormState(definirAgentesCoordenador, inicial);
  const doCoordenador = new Set(
    vendedoras.filter((v) => v.coordenador_id === coordenador.id).map((v) => v.id)
  );
  return (
    <form action={acao} className="rounded-lg border p-4" key={estado.ok ? Date.now() : coordenador.id}>
      <input type="hidden" name="coordenador_id" value={coordenador.id} />
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{coordenador.nome}</p>
          <p className="text-xs text-muted-foreground">{coordenador.email}</p>
        </div>
        <span className="text-xs text-muted-foreground">{doCoordenador.size} agente(s)</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {vendedoras.map((v) => {
          const outro = v.coordenador_id && v.coordenador_id !== coordenador.id;
          return (
            <label key={v.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="vendedor_id"
                value={v.id}
                defaultChecked={doCoordenador.has(v.id)}
                className="h-4 w-4 rounded border-input"
              />
              <span className={outro ? "text-muted-foreground" : ""}>
                {v.nome}
                {outro ? " ↔" : ""}
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <BotaoSalvar rotulo="Salvar equipe" />
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}

export function GestaoCoordenacoes({
  coordenadores,
  vendedoras,
}: {
  coordenadores: Coordenador[];
  vendedoras: VendedoraCoord[];
}) {
  if (coordenadores.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum coordenador cadastrado ainda. Crie um usuário com o perfil “Coordenador” acima.
      </p>
    );
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Marque as agentes de cada coordenador. Ele passa a ver só as ações dessas agentes (o “↔”
        indica agente já vinculada a outro coordenador — marcá-la aqui a transfere).
      </p>
      {coordenadores.map((c) => (
        <FormCoordenacao key={c.id} coordenador={c} vendedoras={vendedoras} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Planos da Venda Externa — o PAP vende só residenciais; o gestor marca aqui
// quais planos aparecem no formulário de visita. Nenhum marcado = todos.
// ---------------------------------------------------------------------------
export function GestaoPlanosExterna({
  planos,
  alvo = "externa",
}: {
  planos: { id: string; nome: string; valor_referencia: number; marcado: boolean }[];
  alvo?: "externa" | "corporativo";
}) {
  const [estado, acao] = useFormState(salvarPlanosExterna, inicial);
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(planos.filter((p) => p.marcado).map((p) => p.id))
  );
  const filtro = busca.trim().toLowerCase();
  const visiveis = filtro
    ? planos.filter((p) => p.nome.toLowerCase().includes(filtro))
    : planos;

  return (
    <form action={acao} className="space-y-3">
      {/* todos os marcados vão no submit, mesmo fora do filtro atual */}
      <input type="hidden" name="alvo" value={alvo} />
      {[...marcados].map((id) => (
        <input key={id} type="hidden" name="plano_id" value={id} />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar plano pelo nome… (ex.: fibra 400)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-xs text-muted-foreground">
          {marcados.size === 0
            ? `Nenhum marcado — o módulo mostra todos os planos ativos.`
            : `${marcados.size} plano(s) no módulo.`}
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border">
        <ul className="divide-y">
          {visiveis.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent/40">
                <input
                  type="checkbox"
                  checked={marcados.has(p.id)}
                  onChange={(e) => {
                    const prox = new Set(marcados);
                    if (e.target.checked) prox.add(p.id);
                    else prox.delete(p.id);
                    setMarcados(prox);
                  }}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {p.valor_referencia.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </label>
            </li>
          ))}
          {visiveis.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhum plano com esse nome.
            </li>
          )}
        </ul>
      </div>
      <div className="flex items-center gap-3">
        <BotaoSalvar rotulo={alvo === "corporativo" ? "Salvar planos do Corporativo" : "Salvar planos do PAP"} />
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tabela oficial de preços dos planos (com fidelidade) — define o valor da
// venda quando o 1º boleto vem pró-rata (menor que o preço do plano).
// ---------------------------------------------------------------------------
function LinhaPreco({ plano }: { plano: { id: string; nome: string; valor_referencia: number } }) {
  const [estado, acao] = useFormState(salvarPrecoPlano, inicial);
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{plano.nome}</span>
      <form action={acao} className="flex items-center gap-2">
        <input type="hidden" name="plano_id" value={plano.id} />
        <span className="text-xs text-muted-foreground">R$</span>
        <Input
          name="valor"
          defaultValue={plano.valor_referencia.toFixed(2).replace(".", ",")}
          className="h-8 w-24 text-right tabular-nums"
        />
        <BotaoSalvar rotulo="Salvar" />
        {estado.ok && <span className="text-xs text-farol-verde">✓</span>}
        {estado.erro && <span className="text-xs text-destructive">{estado.erro}</span>}
      </form>
    </li>
  );
}

export function GestaoPrecosPlanos({
  planos,
}: {
  planos: { id: string; nome: string; valor_referencia: number }[];
}) {
  const [busca, setBusca] = useState("");
  const filtro = busca.trim().toLowerCase();
  const visiveis = filtro ? planos.filter((p) => p.nome.toLowerCase().includes(filtro)) : planos;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar plano pelo nome…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-xs text-muted-foreground">
          Valor oficial COM fidelidade. Boleto pró-rata menor que este valor é elevado ao preço
          da tabela; contrato com valor MAIOR (ex.: condomínio) é preservado.
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border">
        <ul className="divide-y">
          {visiveis.map((p) => (
            <LinhaPreco key={p.id} plano={p} />
          ))}
          {visiveis.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhum plano com esse nome.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
