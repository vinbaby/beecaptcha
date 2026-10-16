import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const URL=Deno.env.get("SUPABASE_URL")??"";
const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");
const ADMIN_KEY=keys.default??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const db=createClient(URL,ADMIN_KEY);
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const sha256=async(v:string)=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("")};
const hostOf=(v:string)=>{try{return new URL(v.includes("://")?v:"https://"+v).host.toLowerCase()}catch{return v.toLowerCase().trim()}};
const domainAllowed=(origin:string|null,domains:string[])=>{if(!origin)return true;try{const host=new URL(origin).host.toLowerCase();return domains.some(d=>{const x=hostOf(d);return x===host||(x.startsWith("*.")&&host.endsWith(x.slice(1)))})}catch{return false}};
const decodeToken=(v:string)=>{try{const s=v.replaceAll("-","+").replaceAll("_","/");return JSON.parse(atob(s+"=".repeat((4-s.length%4)%4)))}catch{return null}};
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type"}});
  if(req.method!=="POST")return reply({success:false,code:"method_not_allowed"},405);
  try{
    const body=await req.json();const siteKey=typeof body.site_key==="string"?body.site_key.trim():"";const secret=typeof body.secret_key==="string"?body.secret_key:"";
    let challengeId=typeof body.challenge_id==="string"?body.challenge_id:"",answer=typeof body.answer==="string"?body.answer.trim().toLowerCase():"",solveToken=typeof body.token==="string"?body.token:"";
    if(typeof body.verification_token==="string"){const p=decodeToken(body.verification_token);if(p){challengeId=typeof p.challenge_id==="string"?p.challenge_id:challengeId;answer=typeof p.answer==="string"?p.answer.trim().toLowerCase():answer;solveToken=typeof p.token==="string"?p.token:solveToken}}
    if(!siteKey||!secret||!challengeId||!answer||!solveToken)return reply({success:false,code:"invalid_request"},400);
    const {data:site}=await db.from("sites").select("id,status,secret_key_hash,allowed_domains").eq("site_key",siteKey).maybeSingle();
    if(!site||site.status!=="active")return reply({success:false,code:"invalid_credentials"},401);
    if(await sha256(secret)!==site.secret_key_hash)return reply({success:false,code:"invalid_credentials"},401);
    if(!domainAllowed(req.headers.get("origin"),site.allowed_domains??[]))return reply({success:false,code:"domain_not_allowed"},403);
    const {data:result,error}=await db.rpc("vin_verify_answer",{p_challenge_id:challengeId,p_answer:answer,p_token_hash:await sha256(solveToken),p_now:new Date().toISOString()});
    if(error)throw error;const row=result?.[0];if(!row||row.site_id!==site.id)return reply({success:false,code:"invalid_challenge"},400);
    const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown",ua=req.headers.get("user-agent")??"";
    await db.from("verification_logs").insert({site_id:site.id,challenge_id:challengeId,success:row.valid===true,ip_hash:await sha256(ip+"|"+ADMIN_KEY),user_agent_hash:ua?await sha256(ua+"|"+ADMIN_KEY):null});
    if(row.valid!==true)return reply({success:false,challenge_id:challengeId,code:row.reason},400);
    const {error:usageError}=await db.rpc("vin_increment_usage",{p_site_id:site.id,p_period:new Date().toISOString().slice(0,10)});if(usageError)throw usageError;
    return reply({success:true,challenge_id:challengeId,score:1});
  }catch{return reply({success:false,code:"internal_error"},500)}
});