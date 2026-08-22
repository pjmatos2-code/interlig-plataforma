// Backfill único das OS de instalação (mesma lógica do worker, sem limite de 20)
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";
for (const a of [".env.local",".env"]) { if(!existsSync(a)) continue;
  for (const l of readFileSync(a,"utf8").split("\n")){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}}
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
await db.connect();
const {rows:cfgRows}=await db.query("select config from integracoes_config where sistema='sgp'");
const conf=cfgRows[0].config;
const BASE=String(conf.base_url).replace(/\/+$/,"").replace(/\/admin$/,"");
const {rows:cands}=await db.query(`
  select id, sgp_contrato_id from contratos
  where status<>'cancelado' and data_venda >= current_date - 45
  order by data_venda desc`);
console.log("candidatos:", cands.length);
let gravadas=0, checados=0;
for (const c of cands){
  try{
    const r=await fetch(BASE+"/api/os/list/",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({token:conf.token,app:conf.app,contrato:Number(c.sgp_contrato_id)}),
      signal:AbortSignal.timeout(20000)});
    if(!r.ok) continue;
    const lista=await r.json();
    const inst=(Array.isArray(lista)?lista:[]).filter(os=>
      String(os.os_setor??"").toLowerCase().includes("operacional") &&
      String(os.os_motivo_descricao??"").toLowerCase().includes("instala"));
    for (const os of inst){
      await db.query(`
        insert into os_instalacao (sgp_os_id, contrato_id, sgp_contrato_id, protocolo, motivo, setor, responsavel, agendamento, os_cadastrada_em, situacao, visto_em)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'aberta',now())
        on conflict (sgp_os_id) do update set responsavel=excluded.responsavel,
          agendamento=excluded.agendamento, situacao='aberta', visto_em=now()`,
        [String(os.os_id), c.id, c.sgp_contrato_id, os.os_protocolo??null, os.os_motivo_descricao??null,
         os.os_setor??null, (os.os_tecnico_responsavel??"").trim()||null, os.os_data_agendamento||null,
         os.os_data_cadastro||null]);
      gravadas++;
    }
    await db.query("update contratos set os_verificado_em=now() where id=$1",[c.id]);
    checados++;
  }catch(e){ /* tenta na próxima */ }
}
console.log("checados:",checados,"OS gravadas:",gravadas);
const {rows:resumo}=await db.query(`
  select count(*) as abertas, count(agendamento) as agendadas,
         count(*) filter (where responsavel is not null) as com_responsavel
  from os_instalacao where situacao='aberta'`);
console.log("resumo:",resumo[0]);
await db.end();
