// Sincroniza os aditivos de um mês: node scripts/sincronizar-aditivos.mjs 2026-08
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";
const dir=process.cwd();
for (const a of [`${dir}/.env.local`,`${dir}/.env`]){ if(!existsSync(a))continue; for(const l of readFileSync(a,"utf8").split("\n")){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}}
const mes = process.argv[2] ?? "2026-08";
const cli=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); await cli.connect();
const cfg=(await cli.query(`select config from integracoes_config where sistema='sgp'`)).rows[0].config;
const base=String(cfg.base_url).replace(/\/+$/,"").replace(/\/admin$/,"");
const ck=new Map(); const ch=()=>[...ck].map(([k,v])=>`${k}=${v}`).join("; ");
async function pegar(rota,extra={}){const r=await fetch(`${base}${rota}`,{redirect:"manual",cache:"no-store",...extra,headers:{"User-Agent":"Mozilla/5.0 (interlig)",Cookie:ch(),...(extra.headers??{})}});
 for(const l of r.headers.getSetCookie?.()??[]){const p=l.split(";")[0];const i=p.indexOf("=");if(i>0)ck.set(p.slice(0,i).trim(),p.slice(i+1).trim());}return r;}
const h0=await (await pegar("/accounts/login/")).text();
const csrf=h0.match(/name="csrfmiddlewaretoken"[^>]*value="([^"]+)"/)?.[1];
await pegar("/accounts/login/",{method:"POST",body:new URLSearchParams({csrfmiddlewaretoken:csrf,username:cfg.painel_usuario,password:cfg.painel_senha,next:"/admin/"}).toString(),headers:{"Content-Type":"application/x-www-form-urlencoded",Referer:`${base}/accounts/login/`}});

const [ano,mm]=mes.split("-"); const ult=new Date(Date.UTC(+ano,+mm,0)).getUTCDate();
const deBr=`01/${mm}/${ano}`, ateBr=`${ult}/${mm}/${ano}`;
const semTags=(h)=>h.replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();

const q=new URLSearchParams({clientebusca:"",clientebuscatipo:"0",usuario:"",status:"1",tipo:"4",data_inicial:deBr,data_final:ateBr});
for (const p of ["1","16","12","18","2","17"]) q.append("Pops",p);
const html=await (await pegar(`/admin/aditivo/list/?${q}`)).text();
const linhas=html.split(/<tr[\s>]/).filter(b=>/\/admin\/aditivo\/\d+\//.test(b)).map(b=>({
  id:b.match(/\/admin\/aditivo\/(\d+)\//)[1],
  cels:[...b.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c=>semTags(c[1]))
})).filter(l=>l.cels.length>=8);

const qa=new URLSearchParams({tipo_pesquisa:"1",tipo_aditivo:"4",assinatura_1:"1",assinatura_2:"1",data_inicial:deBr,data_final:ateBr,paginate_by:"1000",clientebusca:"",clientebuscatipo:"0"});
const hs=semTags(await (await pegar(`/admin/relatorios/contrato/assinatura_eletronica/?${qa}`)).text());
const assinados=new Set([...hs.matchAll(/Aditivo de Fidelidade ID:\s*(\d+)/g)].map(m=>m[1]));

const plano=(d)=>d.match(/^\s*([\dA-Z]+(?:MB|GB)|CORPORATE|FIDELIDADE CORPORATE)/i)?.[1]??null;
const desc=(d)=>{const m=d.match(/R\$\s*([\d.]+,\d{2}|\d+)/); return m?Number(m[1].replace(/\./g,"").replace(",","."))||0:0;};
const dt=(t)=>{const m=t.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m?`${m[3]}-${m[2]}-${m[1]}`:null;};

const ids=[...new Set(linhas.map(l=>l.cels[1]).filter(Boolean))];
const { rows:ctr } = await cli.query(`
  select c.sgp_contrato_id, c.id, c.valor_mensalidade, coalesce(p.valor_referencia,0) ref
  from contratos c left join planos p on p.id=c.plano_id where c.sgp_contrato_id = any($1)`,[ids]);
const info=new Map(ctr.map(c=>{const v=Number(c.valor_mensalidade), r=Number(c.ref);
  return [c.sgp_contrato_id,{id:c.id, mensal: r>0 && v>=r*5 ? r : v, ajustado: r>0 && v>=r*5}];}));

let n=0, ajustados=0;
for (const l of linhas) {
  const c=l.cels, i=info.get(c[1]);
  if (i?.ajustado) ajustados++;
  await cli.query(`
    insert into aditivos (sgp_aditivo_id, sgp_contrato_id, contrato_id, cliente_nome, agente_login, tipo,
      descricao, plano_rotulo, desconto, valor_mensal, data_aditivo, status_sgp,
      assinatura_cliente, assinatura_provedor, finalizado, sincronizado_em)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$13,now())
    on conflict (sgp_aditivo_id) do update set
      valor_mensal=excluded.valor_mensal, status_sgp=excluded.status_sgp,
      assinatura_cliente=excluded.assinatura_cliente, assinatura_provedor=excluded.assinatura_provedor,
      finalizado=excluded.finalizado, sincronizado_em=now()`,
    [l.id, c[1]||null, i?.id??null, c[0], (c[4]||"").toLowerCase(), c[2], c[7], plano(c[7]||""),
     desc(c[7]||""), i?.mensal??0, dt(c[5]), c[3], assinados.has(l.id)]);
  n++;
}
console.log(`mes ${mes}: ${linhas.length} aditivos lidos | ${n} gravados | ${assinados.size} com as 2 assinaturas | ${ajustados} com valor anual normalizado`);
await cli.end();
