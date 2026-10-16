import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const URL=Deno.env.get("SUPABASE_URL")??"";
const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");
const ADMIN_KEY=keys.default??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const db=createClient(URL,ADMIN_KEY);
const out=(x:unknown,s=200,o?:string)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...(o?{"access-control-allow-origin":o}:{})}});
const hash=async(v:string)=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("")};
const token=()=>{const b=new Uint8Array(32);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")};
const host=(v:string)=>{const raw=String(v??"").trim().toLowerCase();if(!raw)return "";try{const u=new URL(raw.includes("://")?raw:"https://"+raw);return u.hostname.toLowerCase()+(u.port?":"+u.port:"")}catch{let head=raw;if(head.startsWith("https://"))head=head.slice(8);else if(head.startsWith("http://"))head=head.slice(7);head=head.split("/")[0].split("?")[0].split("#")[0];while(head.endsWith("."))head=head.slice(0,-1);return head}};
const allowed=(o:string|null,d:string[])=>{if(!o)return true;const h=host(o);if(!h)return false;return d.some(x=>{const y=host(x);if(!y)return false;if(y.startsWith("*.")){const suffix=y.slice(2);return h!==suffix&&h.endsWith("."+suffix)}return y===h})};
const shuffle=<T>(a:T[])=>{const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x};
const makeImage=async()=>{
  const {data:assets,error}=await db.from("captcha_assets").select("id,label,image_url").eq("active",true).eq("kind","image");
  if(error||!assets)throw new Error("asset_pool_unavailable");
  const buckets=new Map<string,any[]>();
  for(const a of assets){const bucket=buckets.get(a.label)||[];bucket.push(a);buckets.set(a.label,bucket)}
  const eligible=[...buckets.entries()].filter(([label,items])=>Boolean(label)&&items.length>=4);
  if(eligible.length<4)throw new Error("asset_pool_unavailable");
  const [target,pp]=eligible[Math.floor(Math.random()*eligible.length)];
  const np=assets.filter((a:any)=>a.label!==target);
  const positives=shuffle(pp).slice(0,Math.min(3,pp.length));
  const negatives=shuffle(np).slice(0,9-positives.length);
  if(positives.length<2||negatives.length<9-positives.length)throw new Error("asset_pool_unavailable");
  const items=shuffle([...positives,...negatives]).slice(0,9).map((a:any)=>({id:a.id,image_url:a.image_url}));
  if(items.length!==9||new Set(items.map((a:any)=>a.id)).size!==9)throw new Error("asset_pool_unavailable");
  return{type:"image_select_v1",data:{version:1,prompt:"Select all images containing a "+target.replaceAll("_"," ")+".",items},answer:positives.map((a:any)=>a.id).sort().join(",")};
};

async function serveImageProxy(req:Request){
 const origin=req.headers.get("origin"),u=new URL(req.url),ident=u.searchParams.get("image")||"",dot=ident.lastIndexOf(".");
 const fail=(status:number,code:string)=>new Response(code,{status,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
 if(dot<1)return fail(404,"not_found");
 const challengeId=ident.slice(0,dot),assetId=ident.slice(dot+1);
 if(!/^[0-9a-f-]{36}$/i.test(challengeId)||!/^[0-9a-f-]{36}$/i.test(assetId))return fail(404,"not_found");
 const {data:challenge,error:ce}=await db.from("captcha_challenges").select("id,site_id,challenge_data,expires_at,challenge_type").eq("id",challengeId).maybeSingle();
 if(ce||!challenge||challenge.challenge_type!=="image_select_v1"||new Date(challenge.expires_at).getTime()<=Date.now())return fail(404,"challenge_expired");
 const {data:site,error:se}=await db.from("sites").select("status,allowed_domains").eq("id",challenge.site_id).maybeSingle();
 if(se||!site||site.status!=="active"||(origin&&!allowed(origin,site.allowed_domains??[])))return fail(403,"domain_not_allowed");
 const items=Array.isArray(challenge.challenge_data?.items)?challenge.challenge_data.items:[];
 const item=items.find((x:any)=>String(x.id)===assetId);
 if(!item||typeof item.image_url!=="string")return fail(404,"asset_not_found");
 let source:URL;try{source=new URL(item.image_url)}catch{return fail(502,"invalid_source")}
 if(source.protocol!=="https:"||source.hostname!=="commons.wikimedia.org"||!source.pathname.startsWith("/wiki/Special:FilePath/"))return fail(502,"source_not_allowed");
 let upstream:Response;try{upstream=await fetch(source.toString(),{redirect:"follow",headers:{accept:"image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"}})}catch{return fail(502,"image_fetch_failed")}
 if(!upstream.ok)return fail(502,"image_upstream_error");
 try{const finalHost=new URL(upstream.url).hostname;if(finalHost!=="commons.wikimedia.org"&&finalHost!=="upload.wikimedia.org")return fail(502,"image_redirect_not_allowed")}catch{return fail(502,"invalid_redirect")}
 const contentType=upstream.headers.get("content-type")||"";
 if(!/^image\/(jpeg|png|webp|gif|avif|svg\+xml)(\s*;|$)/i.test(contentType))return fail(502,"invalid_image_type");
 const length=Number(upstream.headers.get("content-length")||0);if(length>5000000)return fail(413,"image_too_large");
 const bytes=await upstream.arrayBuffer();if(bytes.byteLength>5000000)return fail(413,"image_too_large");
 return new Response(bytes,{status:200,headers:{"content-type":contentType,"content-length":String(bytes.byteLength),"cache-control":"public, max-age=60","access-control-allow-origin":"*","cross-origin-resource-policy":"cross-origin","x-content-type-options":"nosniff"}});
}

Deno.serve(async req=>{const origin=req.headers.get("origin");if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":origin??"","access-control-allow-methods":"POST, GET, OPTIONS","access-control-allow-headers":"content-type"}});if(req.method==="GET")return await serveImageProxy(req);if(req.method!=="POST")return out({success:false,code:"method_not_allowed"},405,origin);try{const b=await req.json(),siteKey=typeof b.site_key==="string"?b.site_key.trim():"";if(!siteKey)return out({success:false,code:"invalid_site_key"},400,origin);const {data:site,error:se}=await db.from("sites").select("id,status,captcha_type,allowed_domains").eq("site_key",siteKey).maybeSingle();if(se||!site||site.status!=="active")return out({success:false,code:"invalid_site_key"},401,origin);if(!allowed(origin,site.allowed_domains??[]))return out({success:false,code:"domain_not_allowed",received_domain:origin?host(origin):null},403,origin);const ip=(req.headers.get("cf-connecting-ip")??req.headers.get("x-real-ip")??req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()??"unknown").slice(0,128),ua=req.headers.get("user-agent")??"",ih=await hash(ip+"|"+ADMIN_KEY),uh=ua?await hash(ua+"|"+ADMIN_KEY):null;const {data:reservation,error:rateError}=await db.rpc("vin_reserve_challenge_rate_limit",{p_site_id:site.id,p_request_ip_hash:ih,p_now:new Date().toISOString()});if(rateError)return out({success:false,code:"rate_limit_unavailable"},503,origin);const rate=Array.isArray(reservation)?reservation[0]:reservation;if(rate?.allowed!==true)return out({success:false,code:"rate_limited",retry_after:Math.max(1,Number(rate?.retry_after)||60)},429,origin);let g:any;if(site.captcha_type==="visual_select_v1"||site.captcha_type==="math_v1")return out({success:false,code:"captcha_type_deprecated",message:"This challenge type has been retired because it is too easy to automate. Switch the site to Image Select."},409,origin);if(site.captcha_type==="image_select_v1")g=await makeImage();else return out({success:false,code:"captcha_type_unavailable"},409,origin);const id=crypto.randomUUID(),t=token(),expires=new Date(Date.now()+120000).toISOString();const storedData=g.data;let clientData=g.data;if(g.type==="image_select_v1"){clientData={...g.data,items:g.data.items.map((item:any)=>({id:item.id,image_url:URL+"/functions/v1/captcha-challenge?image="+encodeURIComponent(id+"."+item.id)}))}}const {error:ie}=await db.from("captcha_challenges").insert({id,site_id:site.id,challenge_type:g.type,challenge_data:storedData,answer_hash:await hash(g.answer),token_hash:await hash(t),expires_at:expires,request_ip_hash:ih,request_user_agent_hash:uh});if(ie)throw ie;return out({success:true,challenge_id:id,challenge_type:g.type,challenge:clientData,token:t,expires_at:expires},200,origin);}catch(e){const unavailable=e instanceof Error&&e.message==="asset_pool_unavailable";return out({success:false,code:unavailable?"challenge_unavailable":"internal_error"},unavailable?503:500,origin)}});