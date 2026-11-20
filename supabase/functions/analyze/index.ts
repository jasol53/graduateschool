import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const model = 'gemini-2.5-flash-lite';
const dailyLimit = 15;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const json = (data: unknown, status=200) => new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
Deno.serve(async (req) => {
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'POST만 지원합니다.'},405);
 const url=Deno.env.get('SUPABASE_URL'), anon=Deno.env.get('SUPABASE_ANON_KEY'), service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service)return json({error:'Supabase 함수 환경변수가 없습니다.'},503);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)return json({error:'로그인해야 합니다.'},401);
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await auth.auth.getUser(token);
 if(authError||!user)return json({error:'로그인 세션이 유효하지 않습니다.'},401);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 let body:any;
 try{const raw=await req.text();if(raw.length>55000)return json({error:'요청 크기가 너무 큽니다.'},413);body=JSON.parse(raw)}catch{return json({error:'JSON 입력이 필요합니다.'},400)}
 if(body?.health===true){
  const {data,error}=await admin.from('research_ai_usage').select('calls').eq('user_id',user.id).eq('day',new Date().toISOString().slice(0,10)).maybeSingle();
  if(error)return json({error:'사용량 조회 실패: '+error.message},503);
  return json({ok:true,model,remaining:Math.max(0,dailyLimit-(data?.calls||0))});
 }
 const {system,user:prompt}=body||{};
 if(typeof system!=='string'||typeof prompt!=='string'||system.length>8000||prompt.length>27000||prompt.length<10)return json({error:'분석 요청 형식이나 길이가 올바르지 않습니다.'},400);
 if(!Deno.env.get('GEMINI_API_KEY'))return json({error:'운영자가 Gemini API 키를 설정하지 않았습니다.'},503);
 const {data:calls,error:quotaError}=await admin.rpc('reserve_research_ai_call',{p_user:user.id,p_daily_limit:dailyLimit});
 if(quotaError)return json({error:'사용량 제한 설정 확인: '+quotaError.message},503);
 if(!calls)return json({error:'하루 AI 요청 15회 한도를 사용했어요. UTC 기준 다음 날 다시 이용해 주세요.'},429);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),50000);
 try{
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
   method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':Deno.env.get('GEMINI_API_KEY')!},
   body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.15,responseMimeType:'application/json',maxOutputTokens:3000}}),signal:controller.signal
  });
  if(!r.ok){let d:any={};try{d=await r.json()}catch{};return json({error:r.status===429?'Gemini 무료 한도를 소진했어요.':('Gemini 요청 실패 '+r.status+': '+String(d.error?.message||'API 설정 확인').slice(0,180))},r.status===429?429:502)}
  const d:any=await r.json(),text=(d.candidates?.[0]?.content?.parts||[]).map((p:any)=>p.text||'').join('');
  if(!text)return json({error:'Gemini에서 빈 답변을 반환했어요.'},502);
  return json({text,remaining:dailyLimit-Number(calls)});
 }catch(e){return json({error:e instanceof DOMException&&e.name==='AbortError'?'AI 응답 시간이 초과됐습니다.':'AI 요청 중 네트워크 오류가 발생했습니다.'},504)}finally{clearTimeout(timer)}
});
