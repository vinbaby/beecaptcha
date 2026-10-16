import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");
const ADMIN_KEY=keys.default??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const db=createClient(SUPABASE_URL,ADMIN_KEY);
const out=(x:unknown,s=200,o?:string)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...(o?{"access-control-allow-origin":o}:{})}});
const hash=async(v:string)=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("")};
const token=()=>{const b=new Uint8Array(32);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")};
const host=(v:string)=>{const raw=String(v??"").trim().toLowerCase();if(!raw)return "";try{const u=new URL(raw.includes("://")?raw:"https://"+raw);return u.hostname.toLowerCase()+(u.port?":"+u.port:"")}catch{let head=raw;if(head.startsWith("https://"))head=head.slice(8);else if(head.startsWith("http://"))head=head.slice(7);head=head.split("/")[0].split("?")[0].split("#")[0];while(head.endsWith("."))head=head.slice(0,-1);return head}};
const allowed=(o:string|null,d:string[])=>{if(!o)return true;const h=host(o);if(!h)return false;return d.some(x=>{const y=host(x);if(!y)return false;if(y.startsWith("*.")){const suffix=y.slice(2);return h!==suffix&&h.endsWith("."+suffix)}return y===h})};
const shuffle=<T>(a:T[])=>{const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x};
const makeImage=async(siteId:string)=>{
  const {data:assets,error}=await db.from("captcha_assets").select("id,label,image_url").eq("active",true).eq("kind","image");
  if(error||!assets)throw new Error("asset_pool_unavailable");
  const buckets=new Map<string,any[]>();
  for(const a of assets){const bucket=buckets.get(a.label)||[];bucket.push(a);buckets.set(a.label,bucket)}
  const eligible=[...buckets.entries()].filter(([label,items])=>Boolean(label)&&items.length>=4);
  if(eligible.length<4)throw new Error("asset_pool_unavailable");
  const {data:recentRows}=await db.from("captcha_challenges").select("challenge_data").eq("site_id",siteId).eq("challenge_type","image_select_v1").order("created_at",{ascending:false}).limit(2);
  const recentTargets=(recentRows||[]).map((row:any)=>String(row.challenge_data?.prompt||"").replace(/^Select all images containing a\\s+/i,"").replace(/[.?!]+$/,"").replaceAll(" ","_")).filter(Boolean);
  const freshEligible=eligible.filter(([label])=>!recentTargets.includes(label));
  const targetPool=freshEligible.length?freshEligible:eligible;
  const [target,pp]=targetPool[Math.floor(Math.random()*targetPool.length)];
  const np=assets.filter((a:any)=>a.label!==target);
  const positives=shuffle(pp).slice(0,Math.min(3,pp.length));
  const negatives=shuffle(np).slice(0,9-positives.length);
  if(positives.length<2||negatives.length<9-positives.length)throw new Error("asset_pool_unavailable");
  const items=shuffle([...positives,...negatives]).slice(0,9).map((a:any)=>({id:a.id,image_url:a.image_url}));
  if(items.length!==9||new Set(items.map((a:any)=>a.id)).size!==9)throw new Error("asset_pool_unavailable");
  return{type:"image_select_v1",data:{version:1,prompt:"Select all images containing a "+target.replaceAll("_"," ")+".",items},answer:positives.map((a:any)=>a.id).sort().join(",")};
};


const makeDrag=()=>{
 const shapes=shuffle(["circle","square","triangle","diamond","star","hexagon"]).slice(0,5);
 const targetIndex=Math.floor(Math.random()*shapes.length);
 const slots=shapes.map((shape,i)=>({id:"slot-"+i,x_pct:10+i*20}));
 return {type:"drag_drop_v1",data:{version:1,prompt:"Drag the piece into the slot with the matching outline.",slots,slot_shapes:shapes,piece_shape:shapes[targetIndex],board_width:470,board_height:140},answer:"slot-"+targetIndex};
};
const makeConnect=()=>{
 const cols=4,rows=4,nodes:any[]=[];
 for(let i=0;i<cols*rows;i++){const row=Math.floor(i/cols),col=i%cols;nodes.push({id:"p"+i,x:40+col*115,y:35+row*60,label:i===0?"A":i===cols*rows-1?"B":""})}
 const visited=new Set<number>([0]),stack=[0],edges:number[][]=[];
 const neighbors=(i:number)=>{const r=Math.floor(i/cols),c=i%cols,out:number[]=[];if(r>0)out.push(i-cols);if(r<rows-1)out.push(i+cols);if(c>0)out.push(i-1);if(c<cols-1)out.push(i+1);return shuffle(out.filter(x=>!visited.has(x)))};
 while(stack.length){const cur=stack[stack.length-1],options=neighbors(cur);if(!options.length){stack.pop();continue}const next=options[0];visited.add(next);edges.push([cur,next]);stack.push(next)}
 const adj=Array.from({length:cols*rows},()=>[] as number[]);edges.forEach(([a,b])=>{adj[a].push(b);adj[b].push(a)});
 const parent=new Map<number,number>([[0,-1]]),queue=[0];for(let i=0;i<queue.length&&!parent.has(cols*rows-1);i++){const cur=queue[i];for(const next of shuffle(adj[cur]))if(!parent.has(next)){parent.set(next,cur);queue.push(next)}}
 const path:number[]=[];let cur=cols*rows-1;while(cur!==-1&&cur!==undefined){path.unshift(cur);cur=parent.get(cur)??-1}
 return {type:"connect_dots_v1",data:{version:1,prompt:"Trace the connected route from point A to point B. Follow the lines; do not jump between dots.",board_width:430,board_height:250,nodes,edges},answer:path.map(i=>"p"+i).join(",")};
};
const shapeSvg=(shape:string,cx:number,cy:number,r:number,fill:string,stroke:string,sw:number)=>{
 if(shape==="circle")return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
 if(shape==="square")return '<rect x="'+(cx-r)+'" y="'+(cy-r)+'" width="'+(r*2)+'" height="'+(r*2)+'" rx="3" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
 const sides=shape==="triangle"?3:shape==="diamond"?4:shape==="hexagon"?6:10,points:string[]=[];
 for(let i=0;i<sides;i++){const angle=-Math.PI/2+i*Math.PI*2/sides,rr=shape==="star"&&i%2===1?r*.48:r;points.push((cx+Math.cos(angle)*rr).toFixed(2)+","+(cy+Math.sin(angle)*rr).toFixed(2))}
 return '<polygon points="'+points.join(" ")+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'" stroke-linejoin="round"/>';
};
const svgReply=(svg:string)=>new Response(svg,{status:200,headers:{"content-type":"image/svg+xml; charset=utf-8","cache-control":"private, max-age=30","access-control-allow-origin":"*","cross-origin-resource-policy":"cross-origin","x-content-type-options":"nosniff"}});
const renderDragBoard=(data:any)=>{
 const w=470,h=140,shapes=Array.isArray(data.slot_shapes)?data.slot_shapes:[],parts:string[]=[];
 for(let i=0;i<5;i++){const cx=47+i*94;parts.push('<rect x="'+(cx-37)+'" y="27" width="74" height="76" rx="12" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 3"/>');parts.push(shapeSvg(shapes[i]||"circle",cx,65,21,"#ffffff","#64748b",2.4))}
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><rect width="100%" height="100%" rx="16" fill="#f1f5f9"/>'+parts.join("")+'</svg>';
};
const renderDragPiece=(data:any)=>'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect x="1" y="1" width="94" height="94" rx="16" fill="#eff6ff" stroke="#bfdbfe"/>'+shapeSvg(String(data.piece_shape||"circle"),48,48,29,"#2563eb","#1d4ed8",2.5)+'</svg>';
const renderConnectBoard=(data:any)=>{
 const w=Number(data.board_width)||430,h=Number(data.board_height)||250,nodes=Array.isArray(data.nodes)?data.nodes:[],edges=Array.isArray(data.edges)?data.edges:[],parts:string[]=[];
 for(const pair of edges){const a=nodes[pair[0]],b=nodes[pair[1]];if(a&&b)parts.push('<line x1="'+Number(a.x)+'" y1="'+Number(a.y)+'" x2="'+Number(b.x)+'" y2="'+Number(b.y)+'" stroke="#94a3b8" stroke-width="5" stroke-linecap="round"/>')}
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><rect width="100%" height="100%" rx="16" fill="#f8fafc"/>'+parts.join("")+'</svg>';
};

const resolvedImageCache = new Map<string,{expires:number,urls:string[]}>();
async function imageCandidates(imageUrl:string){
 const cached=resolvedImageCache.get(imageUrl);
 if(cached&&cached.expires>Date.now())return cached.urls;
 const urls:string[]=[];
 try{
  const original=new URL(imageUrl);
  if(original.protocol==="https:"&&original.hostname==="commons.wikimedia.org"&&original.pathname.startsWith("/wiki/Special:FilePath/")){
   let filename=decodeURIComponent(original.pathname.slice("/wiki/Special:FilePath/".length));
   filename=filename.replaceAll("_"," ");
   const api=new URL("https://commons.wikimedia.org/w/api.php");
   api.searchParams.set("action","query");
   api.searchParams.set("format","json");
   api.searchParams.set("formatversion","2");
   api.searchParams.set("prop","imageinfo");
   api.searchParams.set("iiprop","url");
   api.searchParams.set("iiurlwidth","640");
   api.searchParams.set("titles","File:"+filename);
   const response=await fetch(api.toString(),{redirect:"follow",headers:{accept:"application/json","user-agent":"BeeCaptcha/1.0 (https://beecaptcha.vercel.app/)","api-user-agent":"BeeCaptcha/1.0 (https://beecaptcha.vercel.app/)"},signal:AbortSignal.timeout(8000)});
   if(response.ok){
    const payload=await response.json();
    const page=payload?.query?.pages?.[0];
    const info=page?.imageinfo?.[0];
    const thumbnail=typeof info?.thumburl==="string"?info.thumburl:(typeof info?.url==="string"?info.url:"");
    if(thumbnail){
     const thumb=new URL(thumbnail);
     if(thumb.protocol==="https:"&&(thumb.hostname==="upload.wikimedia.org"||thumb.hostname==="commons.wikimedia.org"))urls.push(thumb.toString());
    }
   }else{
    console.warn("captcha_image_metadata_http_error",response.status,original.pathname);
   }
  }
 }catch(error){
  console.warn("captcha_image_metadata_lookup_failed",String(error));
 }
 if(!urls.includes(imageUrl))urls.push(imageUrl);
 resolvedImageCache.set(imageUrl,{expires:Date.now()+(urls.length>1?24*60*60*1000:60*1000),urls});
 return urls;
}

async function serveImageProxy(req:Request){
 const origin=req.headers.get("origin"),u=new URL(req.url),ident=u.searchParams.get("image")||"",publicAssetId=u.searchParams.get("asset")||"",siteId=u.searchParams.get("site_id")||"";
 const fail=(status:number,code:string)=>new Response(code,{status,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
 let assetId="",imageUrl="",challengeId="";
 if(publicAssetId){
  if(!/^[0-9a-f-]{36}$/i.test(publicAssetId)||!/^[0-9a-f-]{36}$/i.test(siteId))return fail(404,"not_found");
  const {data:site,error:siteError}=await db.from("sites").select("status,allowed_domains").eq("id",siteId).maybeSingle();
  if(siteError||!site||site.status!=="active"||(origin&&!allowed(origin,site.allowed_domains??[])))return fail(403,"domain_not_allowed");
  const {data:asset,error:assetError}=await db.from("captcha_assets").select("id,image_url").eq("id",publicAssetId).eq("active",true).eq("kind","image").maybeSingle();
  if(assetError||!asset||typeof asset.image_url!=="string")return fail(404,"asset_not_found");
  assetId=asset.id;imageUrl=asset.image_url;
 }else{
  const dot=ident.lastIndexOf(".");
  if(dot<1)return fail(404,"not_found");
  challengeId=ident.slice(0,dot);assetId=ident.slice(dot+1);
  if(!/^[0-9a-f-]{36}$/i.test(challengeId)||!/^(?:[0-9a-f-]{36}|drag-board|drag-piece|connect-board)$/i.test(assetId))return fail(404,"not_found");
  const {data:challenge,error:ce}=await db.from("captcha_challenges").select("id,site_id,challenge_data,expires_at,challenge_type").eq("id",challengeId).maybeSingle();
  if(ce||!challenge||new Date(challenge.expires_at).getTime()<=Date.now())return fail(404,"challenge_expired");
  const {data:site,error:se}=await db.from("sites").select("status,allowed_domains").eq("id",challenge.site_id).maybeSingle();
  if(se||!site||site.status!=="active"||(origin&&!allowed(origin,site.allowed_domains??[])))return fail(403,"domain_not_allowed");
  if(challenge.challenge_type==="drag_drop_v1"&&(assetId==="drag-board"||assetId==="drag-piece"))return svgReply(assetId==="drag-board"?renderDragBoard(challenge.challenge_data):renderDragPiece(challenge.challenge_data));
  if(challenge.challenge_type==="connect_dots_v1"&&assetId==="connect-board")return svgReply(renderConnectBoard(challenge.challenge_data));
  if(challenge.challenge_type!=="image_select_v1")return fail(404,"asset_not_found");
  const items=Array.isArray(challenge.challenge_data?.items)?challenge.challenge_data.items:[];
  const item=items.find((x:any)=>String(x.id)===assetId);
  if(!item||typeof item.image_url!=="string")return fail(404,"asset_not_found");
  imageUrl=item.image_url;
 }
 let candidates=await imageCandidates(imageUrl);
 let lastFailure="image_upstream_error";
 for(const candidate of candidates){
  let source:URL;
  try{source=new URL(candidate)}catch{lastFailure="invalid_source";continue}
  if(source.protocol!=="https:"||(source.hostname!=="commons.wikimedia.org"&&source.hostname!=="upload.wikimedia.org")){lastFailure="source_not_allowed";continue}
  let upstream:Response;
  try{
   upstream=await fetch(source.toString(),{redirect:"follow",headers:{accept:"image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8","user-agent":"BeeCaptcha/1.0 (https://beecaptcha.vercel.app/)","api-user-agent":"BeeCaptcha/1.0 (https://beecaptcha.vercel.app/)"},signal:AbortSignal.timeout(12000)});
  }catch(error){lastFailure="image_fetch_failed";console.warn("captcha_image_fetch_failed",assetId,String(error));continue}
  if(!upstream.ok){lastFailure="image_upstream_http_"+upstream.status;console.warn("captcha_image_upstream_non_ok",assetId,upstream.status,upstream.url);continue}
  try{
   const finalUrl=new URL(upstream.url);
   if(finalUrl.protocol!=="https:"||(finalUrl.hostname!=="commons.wikimedia.org"&&finalUrl.hostname!=="upload.wikimedia.org")){lastFailure="invalid_redirect";console.warn("captcha_image_redirect_rejected",assetId,finalUrl.hostname);continue}
  }catch{lastFailure="invalid_redirect";continue}
  const contentType=upstream.headers.get("content-type")||"";
  if(!/^image\/(jpeg|png|webp|gif|avif|svg\+xml)(\s*;|$)/i.test(contentType)){lastFailure="invalid_image_type";console.warn("captcha_image_bad_content_type",assetId,contentType,upstream.url);continue}
  const length=Number(upstream.headers.get("content-length")||0);
  if(length>5000000){lastFailure="image_too_large";continue}
  const bytes=await upstream.arrayBuffer();
  if(bytes.byteLength>5000000){lastFailure="image_too_large";continue}
  resolvedImageCache.set(imageUrl,{expires:Date.now()+24*60*60*1000,urls:[candidate]});
  return new Response(bytes,{status:200,headers:{"content-type":contentType,"content-length":String(bytes.byteLength),"cache-control":"public, max-age=86400, s-maxage=86400, immutable","access-control-allow-origin":"*","cross-origin-resource-policy":"cross-origin","x-content-type-options":"nosniff"}});
 }
 return fail(502,lastFailure);
}

Deno.serve(async req=>{const origin=req.headers.get("origin");if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":origin??"","access-control-allow-methods":"POST, GET, OPTIONS","access-control-allow-headers":"content-type"}});if(req.method==="GET")return await serveImageProxy(req);if(req.method!=="POST")return out({success:false,code:"method_not_allowed"},405,origin);try{const b=await req.json(),siteKey=typeof b.site_key==="string"?b.site_key.trim():"";if(!siteKey)return out({success:false,code:"invalid_site_key"},400,origin);const {data:site,error:se}=await db.from("sites").select("id,status,captcha_type,allowed_domains").eq("site_key",siteKey).maybeSingle();if(se||!site||site.status!=="active")return out({success:false,code:"invalid_site_key"},401,origin);if(!allowed(origin,site.allowed_domains??[]))return out({success:false,code:"domain_not_allowed",received_domain:origin?host(origin):null},403,origin);const ip=(req.headers.get("cf-connecting-ip")??req.headers.get("x-real-ip")??req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()??"unknown").slice(0,128),ua=req.headers.get("user-agent")??"",ih=await hash(ip+"|"+ADMIN_KEY),uh=ua?await hash(ua+"|"+ADMIN_KEY):null;const {data:reservation,error:rateError}=await db.rpc("vin_reserve_challenge_rate_limit",{p_site_id:site.id,p_request_ip_hash:ih,p_now:new Date().toISOString()});if(rateError)return out({success:false,code:"rate_limit_unavailable"},503,origin);const rate=Array.isArray(reservation)?reservation[0]:reservation;if(rate?.allowed!==true)return out({success:false,code:"rate_limited",retry_after:Math.max(1,Number(rate?.retry_after)||60)},429,origin);let selectedType=site.captcha_type;
if(selectedType==="auto"){
 const since=new Date(Date.now()-10*60*1000).toISOString();
 let riskQuery=db.from("captcha_challenges").select("attempt_count").eq("site_id",site.id).eq("request_ip_hash",ih).gte("created_at",since).gt("attempt_count",0).limit(30);
 if(uh)riskQuery=riskQuery.eq("request_user_agent_hash",uh);
 const {data:riskRows,error:riskError}=await riskQuery;
 if(riskError){
  console.warn("auto_captcha_risk_query_failed",site.id);
  selectedType="image_select_v1";
 }else{
  const recentWrongAttempts=(riskRows||[]).reduce((sum:any,row:any)=>sum+Math.max(0,Number(row.attempt_count)||0),0);
  if(recentWrongAttempts>=2){
   selectedType="image_select_v1";
  }else{
   const {data:recentFast,error:rotationError}=await db.from("captcha_challenges").select("challenge_type").eq("site_id",site.id).in("challenge_type",["drag_drop_v1","connect_dots_v1"]).order("created_at",{ascending:false}).limit(1);
   if(rotationError){
    console.warn("auto_captcha_rotation_query_failed",site.id);
    selectedType="image_select_v1";
   }else if(Math.random()<0.15){
    selectedType="image_select_v1";
   }else if(recentFast?.[0]?.challenge_type==="drag_drop_v1"){
    selectedType="connect_dots_v1";
   }else if(recentFast?.[0]?.challenge_type==="connect_dots_v1"){
    selectedType="drag_drop_v1";
   }else{
    selectedType=Math.random()<0.5?"drag_drop_v1":"connect_dots_v1";
   }
  }
 }
}
let g:any;
if(selectedType==="visual_select_v1"||selectedType==="math_v1")return out({success:false,code:"captcha_type_deprecated",message:"This challenge type has been retired because it is too easy to automate. Switch the site to Auto or Image Select."},409,origin);
if(selectedType==="image_select_v1")g=await makeImage(site.id);
else if(selectedType==="drag_drop_v1")g=makeDrag();
else if(selectedType==="connect_dots_v1")g=makeConnect();
else return out({success:false,code:"captcha_type_unavailable"},409,origin);const id=crypto.randomUUID(),t=token(),expires=new Date(Date.now()+120000).toISOString();const storedData=g.data;let clientData:any;
if(g.type==="image_select_v1"){
 clientData={...g.data,items:g.data.items.map((item:any)=>({id:item.id,image_url:SUPABASE_URL+"/functions/v1/captcha-challenge?asset="+encodeURIComponent(item.id)+"&site_id="+encodeURIComponent(site.id),fallback_url:item.image_url}))};
}else if(g.type==="drag_drop_v1"){
 clientData={version:g.data.version,prompt:g.data.prompt,slots:g.data.slots,board_url:SUPABASE_URL+"/functions/v1/captcha-challenge?image="+encodeURIComponent(id+".drag-board"),piece_url:SUPABASE_URL+"/functions/v1/captcha-challenge?image="+encodeURIComponent(id+".drag-piece")};
}else if(g.type==="connect_dots_v1"){
 clientData={version:g.data.version,prompt:g.data.prompt,board_width:g.data.board_width,board_height:g.data.board_height,nodes:g.data.nodes.map((node:any)=>({id:node.id,x:node.x,y:node.y,label:node.label})),edges:g.data.edges,board_url:SUPABASE_URL+"/functions/v1/captcha-challenge?image="+encodeURIComponent(id+".connect-board")};
}else{return out({success:false,code:"captcha_type_unavailable"},409,origin)}
const {error:ie}=await db.from("captcha_challenges").insert({id,site_id:site.id,challenge_type:g.type,challenge_data:storedData,answer_hash:await hash(g.answer),token_hash:await hash(t),expires_at:expires,request_ip_hash:ih,request_user_agent_hash:uh});if(ie)throw ie;return out({success:true,challenge_id:id,challenge_type:g.type,challenge:clientData,token:t,expires_at:expires},200,origin);}catch(e){const unavailable=e instanceof Error&&e.message==="asset_pool_unavailable";return out({success:false,code:unavailable?"challenge_unavailable":"internal_error"},unavailable?503:500,origin)}});