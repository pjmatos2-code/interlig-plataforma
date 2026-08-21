"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  criarUsuario,
  alternarUsuario,
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
import { ROTULO_ORIGEM, ROTULO_PERFIL, type CategoriaOrigem, type Perfil } from "@/lib/tipos";

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
  usuarios: { id: string; nome: string; email: string; perfil: Perfil; ativo: boolean; pop: string | null; vendedora: string | null }[];
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
          <option value="vendedora">Vendedora</option>
          <option value="supervisor">Supervisor</option>
          <option value="gestor">Gestor</option>
        </select>
        {perfil === "supervisor" && (
          <select name="pop_id" className={selectCls} required>
            <option value="">POP…</option>
            {pops.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        )}
        {perfil === "vendedora" && (
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
                  <BotaoAlternar ativo={u.ativo} acao={() => alternarUsuario(u.id, !u.ativo)} />
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
