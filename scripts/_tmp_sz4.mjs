import { readFileSync, existsSync } from "node:fs";
const dir=process.cwd();
for (const a of [`${dir}/.env.local`,`${dir}/.env`]){ if(!existsSync(a))continue; for(const l of readFileSync(a,"utf8").split("\n")){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}}
const url=process.env.NEXT_PUBLIC_SUPABASE_URL, srv=process.env.SUPABASE_SERVICE_ROLE_KEY;
const res=await fetch(`${url}/rest/v1/integracoes_config?sistema=eq.szchat&select=config`,{headers:{apikey:srv,Authorization:`Bearer ${srv}`},cache:"no-store"});
const cfg=(await res.json())[0].config;
const base=(cfg.base_url||"https://interlig.sz.chat").replace(/\/+$/,"");
let cookie=""; let csrf="";
const juntar=(r)=>{ const novos=r.headers.getSetCookie?.()??[]; const jar=new Map(cookie.split(";").map(p=>p.trim()).filter(Boolean).map(p=>[p.split("=")[0],p]));
  for(const l of novos){const par=l.split(";")[0]; if(par.split("=")[0]) jar.set(par.split("=")[0],par);} cookie=[...jar.values()].join("; "); };
const r=await fetch(`${base}/login`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({email:cfg.robo_email,password:cfg.robo_senha}),redirect:"manual",cache:"no-store"});
juntar(r);
const home=await fetch(`${base}/reports/messages`,{headers:{Cookie:cookie,Accept:"text/html"},cache:"no-store"});
juntar(home); csrf=(await home.text()).match(/name="csrf-token"\s+content="([^"]+)"/)?.[1]??"";
console.log("login SZ ok");
const porCampanha=new Map();
for (const dia of ["2026-08-25","2026-08-26","2026-08-27","2026-08-28"]) {
  const dateParam=encodeURIComponent(JSON.stringify({start:dia,end:dia}));
  for(let p=1;p<=30;p++){
    const res2=await fetch(`${base}/reports/messages/filter?page=${p}&channel=&contact=&protocol=&agent=&contactName=&attendance=&platform_id=&options_conversations=all&view_conversation=default&data_privacy=hidden&typeStatus=all&copilot_score=&attendance_classification=&closing_reason=&finalCampaign=&finalAgent=&date=${dateParam}`,
      {headers:{Cookie:cookie,"X-Requested-With":"XMLHttpRequest","X-CSRF-TOKEN":csrf,Accept:"application/json"},cache:"no-store"});
    if(!res2.ok){ console.log(dia,"pag",p,"->",res2.status); break; }
    const j=await res2.json();
    for(const c of j.data??[]){
      const camp=String(c.campaign?.name??c.campaign_name??(typeof c.campaign==="string"?c.campaign:null)??c.campaign_id??"?");
      porCampanha.set(camp,(porCampanha.get(camp)??0)+1);
    }
    if(!j.has_next) break;
  }
}
console.log("\n=== conversas 25 a 28/08 por campanha (4 dias) ===");
for(const [c,n] of [...porCampanha].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(4)}  ${c}`);
