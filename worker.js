// Cloudflare Worker. All exam secrets, answer keys and submissions remain server-side.
// Set GH_TOKEN as a Cloudflare secret, and GH_REPO = Mohamed-Azab03/Academic-Exam-Studio.
const HEADERS = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const fail = (msg, status=400) => new Response(JSON.stringify({error:msg}),{status,headers:HEADERS});
const send = (data,status=200) => new Response(JSON.stringify(data),{status,headers:HEADERS});
const enc = path => path.split("/").map(encodeURIComponent).join("/");
function repo(env) {
  const value = env.GH_REPO || "Mohamed-Azab03/Academic-Exam-Studio";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw Error("Invalid repository setting");
  return value;
}
async function github(env, method, path, data) {
  if (!env.GH_TOKEN) throw Error("GH_TOKEN secret is missing");
  const response = await fetch("https://api.github.com/repos/"+repo(env)+"/contents/"+enc(path),{
    method,
    headers:{"Authorization":"Bearer "+env.GH_TOKEN,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"AcademicExamStudio"},
    body:data ? JSON.stringify(data) : undefined
  });
  const json = await response.json().catch(()=>({}));
  if (!response.ok) { const err=new Error("GitHub error "+response.status); err.status=response.status; throw err; }
  return json;
}
function base64(str) {
  const bytes=new TextEncoder().encode(str);
  let binary=""; for (const b of bytes) binary+=String.fromCharCode(b);
  return btoa(binary);
}
function unbase64(str) {
  const binary=atob(str.replace(/\n/g,""));
  return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));
}
async function read(env,path) {
  const file=await github(env,"GET",path);
  return JSON.parse(unbase64(file.content));
}
async function writeNew(env,path,object) {
  return github(env,"PUT",path,{message:"Record exam "+path,content:base64(JSON.stringify(object,null,2)+"\n")});
}
async function config(env) {
  const c=await read(env,"exam.config.json");
  if (!c.enabled || !Array.isArray(c.questions) || !Array.isArray(c.students)) throw Error("Exam is not configured or enabled");
  return c;
}
function verify(c, info) {
  if (typeof info.studentId!=="string" || typeof info.code!=="string") return "Provide Student ID and Exam Code";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(info.studentId)) return "Invalid Student ID format";
  if (info.code!==c.code || !c.students.includes(info.studentId)) return "Invalid student credentials";
  const now=Date.now();
  if (now < Date.parse(c.opensAt)) return "Exam has not opened";
  if (now >= Date.parse(c.closesAt)) return "Exam has closed";
  return null;
}
function safeQuestions(c) {
  return c.questions.map(q=>({id:q.id,text:q.text,options:q.options}));
}
function attemptPath(sid) { return "exam-data/starts/"+sid+".json"; }
function responsePath(sid) { return "exam-data/submissions/"+sid+".json"; }
async function getOrCreateStart(env,sid) {
  try {return await read(env,attemptPath(sid));}
  catch(e) { if(e.status!==404) throw e; }
  const start={studentId:sid,startedAt:new Date().toISOString()};
  try {await writeNew(env,attemptPath(sid),start); return start;}
  catch(e) {
    // Another simultaneous request may have created the same file.
    if(e.status===422 || e.status===409) return read(env,attemptPath(sid));
    throw e;
  }
}
function deadline(c,start) {
  return Math.min(Date.parse(c.closesAt),Date.parse(start.startedAt)+Number(c.durationMinutes)*60000);
}
async function trySubmission(env,sid) {
  try {return await read(env,responsePath(sid));}
  catch(e) { if(e.status===404) return null; throw e; }
}
async function handleStart(env,body) {
  const c=await config(env);
  const problem=verify(c,body); if(problem) return fail(problem,403);
  if(await trySubmission(env,body.studentId)) return fail("This student has already submitted",409);
  const start=await getOrCreateStart(env,body.studentId);
  const cutoff=deadline(c,start);
  if(!Number.isFinite(cutoff) || Date.now()>=cutoff) return fail("This attempt has expired",403);
  return send({title:c.title,questions:safeQuestions(c),deadline:new Date(cutoff).toISOString()});
}
async function handleSubmit(env,body) {
  const c=await config(env);
  const problem=verify(c,body); if(problem) return fail(problem,403);
  const sid=body.studentId;
  // Students must previously have begun the exam.
  let start; try {start=await read(env,attemptPath(sid));}
  catch(e){if(e.status===404)return fail("Start the exam first",403);throw e;}
  const cutoff=deadline(c,start);
  if(Date.now()>=cutoff) return fail("Submission deadline has passed",403);
  if(!body.answers || typeof body.answers!=="object" || Array.isArray(body.answers)) return fail("Invalid answers");
  if(await trySubmission(env,sid)) return fail("Already submitted",409);
  const answers={};
  let score=0;
  for(const q of c.questions) {
    const selected=body.answers[q.id];
    if(Number.isInteger(selected) && selected>=0 && selected<q.options.length) answers[q.id]=selected;
    else answers[q.id]=null;
    if(answers[q.id]===q.correct) score++;
  }
  try {
    await writeNew(env,responsePath(sid),{
      studentId:sid,startedAt:start.startedAt,submittedAt:new Date().toISOString(),
      score,total:c.questions.length,answers
    });
  } catch(e) {
    if(e.status===409 || e.status===422) return fail("Already submitted",409);
    throw e;
  }
  return send({message:"Exam submitted successfully",questionCount:c.questions.length});
}
const HTML=String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Academic Exam Studio</title><style>
:root{font:16px system-ui,Arial;color:#142541;background:#f0f4fa}*{box-sizing:border-box}body{margin:0}header{background:#152d50;color:white;padding:22px max(24px,calc((100vw - 780px)/2))}main{max-width:780px;margin:35px auto;padding:30px;background:white;border-radius:18px;box-shadow:0 12px 50px #14254118}h1{font-size:28px;margin:0 0 10px}h2{font-size:19px}p{line-height:1.6}input[type=text],input[type=password]{padding:13px;width:100%;border:1px solid #b8c7da;border-radius:8px;margin:5px 0 16px;font:inherit}label{display:block}button{padding:12px 18px;border:0;border-radius:8px;background:#1b5faa;color:#fff;font:inherit;cursor:pointer}button:disabled{opacity:.5}fieldset{border:1px solid #dae3ed;border-radius:12px;margin:20px 0;padding:20px}fieldset label{padding:7px 4px}.muted{color:#6c7b91}.error{color:#ab2338}.success{color:#146742}.hidden{display:none}#clock{font-size:20px;font-weight:bold;color:#8d3c24}
</style></head><body><header><strong>Academic Exam Studio</strong> · Secure student examination</header><main><section id="gate"><h1>Enter your exam</h1><p class="muted">Enter the details provided by your instructor to begin.</p><form id="enter"><label>Student ID<input type="text" id="studentId" autocomplete="off" required></label><label>Exam Code<input type="password" id="examCode" autocomplete="off" required></label><button type="submit">Start exam</button></form></section><section id="exam" class="hidden"><h1 id="examTitle">Exam</h1><p id="clock" role="timer"></p><form id="answers"></form><button id="submitBtn" type="button">Submit exam</button></section><p id="status" role="status"></p></main><script>
let cred,deadline,timer,submitted=false;const $=x=>document.getElementById(x);
const msg=(text,error=false)=>{$("status").textContent=text;$("status").className=error?"error":"success"};
async function api(path,data) {const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});let x=await r.json();if(!r.ok)throw Error(x.error||"Request failed");return x}
$("enter").onsubmit=async e=>{e.preventDefault();cred={studentId:$("studentId").value.trim(),code:$("examCode").value.trim()};msg("Checking exam access…");try{const exam=await api("/api/start",cred);deadline=Date.parse(exam.deadline);$("examTitle").textContent=exam.title;$("answers").replaceChildren();for(let i=0;i<exam.questions.length;i++){const q=exam.questions[i],box=document.createElement("fieldset"),legend=document.createElement("legend");legend.textContent=(i+1)+". "+q.text;box.append(legend);q.options.forEach((option,j)=>{const label=document.createElement("label"),radio=document.createElement("input");radio.type="radio";radio.name=q.id;radio.value=j;label.append(radio,document.createTextNode(" "+option));box.append(label)});$("answers").append(box)}$("gate").classList.add("hidden");$("exam").classList.remove("hidden");msg("");tick();timer=setInterval(tick,1000)}catch(err){msg(err.message,true)}};
function tick(){let sec=Math.max(0,Math.floor((deadline-Date.now())/1000));$("clock").textContent="Time left: "+Math.floor(sec/60)+"m "+String(sec%60).padStart(2,"0")+"s";if(sec===0){clearInterval(timer);$("submitBtn").disabled=true;msg("The deadline has passed. Unsubmitted answers cannot be accepted.",true)}}
$("submitBtn").onclick=async()=>{if(submitted||Date.now()>=deadline)return;if(!confirm("Submit your final answers?"))return;const answers={};new FormData($("answers")).forEach((v,k)=>answers[k]=Number(v));$("submitBtn").disabled=true;try{await api("/api/submit",{...cred,answers});submitted=true;clearInterval(timer);$("exam").classList.add("hidden");msg("Your exam was submitted successfully.")}catch(err){msg(err.message,true);if(Date.now()<deadline)$("submitBtn").disabled=false}};
</script></body></html>`;
export default {
  async fetch(req,env) {
    const u=new URL(req.url);
    if(req.method==="GET" && u.pathname==="/") return new Response(HTML,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
    if(req.method==="POST" && (u.pathname==="/api/start" || u.pathname==="/api/submit")) {
      if(req.headers.get("content-type")?.split(";")[0]!=="application/json") return fail("Send JSON");
      if(Number(req.headers.get("content-length")||0)>20000) return fail("Request too large",413);
      const origin=req.headers.get("origin"); if(origin && origin!==u.origin) return fail("Invalid origin",403);
      let body;try {body=await req.json()}catch{return fail("Invalid JSON")}
      try {return u.pathname==="/api/start"?await handleStart(env,body):await handleSubmit(env,body)}
      catch(err){console.error(err);return fail("Server error. Contact the instructor.",500)}
    }
    return fail("Not found",404);
  }
};
