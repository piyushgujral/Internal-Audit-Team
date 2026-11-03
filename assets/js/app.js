import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./config.js";

const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0,10);
let supabase = null, currentUser = null, profile = null, clients = [], engagements = [], tasks = [];
const esc = (v="") => String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const overdue = t => t.status !== "completed" && t.due_date && t.due_date < today();
const statusLabel = s => ({pending:"Pending",in_progress:"In Progress",under_review:"Under Review",completed:"Completed",on_hold:"On Hold"}[s]||s);
const pct = t => t.status === "completed" ? 100 : Number(t.progress||0);
const msg = (text, bad=false) => { $("loginMessage").textContent=text; $("loginMessage").style.color=bad?"#b23f3f":"#778399"; };
function showLogin(){ $("loginView").classList.remove("hidden"); $("app").classList.add("hidden"); }
function showApp(){ $("loginView").classList.add("hidden"); $("app").classList.remove("hidden"); $("welcome").textContent=profile?.full_name ? "Welcome, "+profile.full_name : currentUser.email; }
function modal(id,on){ $(id).classList.toggle("show",on); }
function activate(page){
 document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
 document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
 $(page).classList.add("active");
 $("pageTitle").textContent=({dashboard:"Audit command centre",clients:"Client management",tasks:"Task register",team:"Team workload",reports:"MIS reports"})[page];
 renderAll();
}
document.querySelectorAll(".nav").forEach(n=>n.addEventListener("click",()=>activate(n.dataset.page)));

async function boot(){
 if(!isSupabaseConfigured){$("configNotice").classList.remove("hidden");$("loginForm").querySelector("button").disabled=true;msg("Configure Supabase in assets/js/config.js to enable secure sign-in.");return;}
 $("configNotice").classList.add("hidden");
 supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
 const {data:{session}}=await supabase.auth.getSession();
 if(session) await loadWorkspace();
 supabase.auth.onAuthStateChange(async(_event,session)=>{if(session && !currentUser) await loadWorkspace(); else if(!session){currentUser=null;profile=null;showLogin();}});
}
$("loginForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!supabase){msg("Supabase configuration is required.",true);return;}
 const {error}=await supabase.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
 if(error)msg(error.message,true);else msg("Signed in. Loading workspace…");
});
$("signOut").addEventListener("click",async()=>{if(supabase)await supabase.auth.signOut();currentUser=null;profile=null;showLogin();});
async function loadWorkspace(){
 const {data:{user}}=await supabase.auth.getUser();if(!user)return;currentUser=user;
 const {data:p,error:pe}=await supabase.from("profiles").select("*").eq("id",user.id).single();
 if(pe){console.error(pe);msg("Your profile is not provisioned. Ask the AuditFlow administrator.",true);await supabase.auth.signOut();return;}
 profile=p;showApp();await refreshData();
}
async function refreshData(){
 const [c,e,t]=await Promise.all([
  supabase.from("clients").select("*").order("name"),
  supabase.from("engagements").select("*, clients(name)").order("created_at",{ascending:false}),
  supabase.from("tasks").select("*, clients(name), engagements(name)").order("due_date")
 ]);
 for(const x of [c,e,t])if(x.error){console.error(x.error);alert("Unable to load workspace data: "+x.error.message);return;}
 clients=c.data||[];engagements=e.data||[];tasks=t.data||[];renderAll();
}
function renderAll(){renderDashboard();renderClients();renderTasks();renderTeam();renderReports();populateFilters();}
function renderDashboard(){
 const total=tasks.length,done=tasks.filter(t=>t.status==="completed").length,active=tasks.filter(t=>t.status==="in_progress").length,late=tasks.filter(overdue).length,pending=tasks.filter(t=>t.status==="pending").length;
 $("kpis").innerHTML=[["Clients",clients.length,"Authorised client records"],["Audit engagements",engagements.length,"Active and historical audits"],["Tasks completed",done,"Successfully completed"],["Overdue tasks",late,"Past target completion date"]].map(x=>`<div class="card"><div class="card-label">${x[0]}</div><div class="card-value">${x[1]}</div><div class="card-foot">${x[2]}</div></div>`).join("");
 $("clientProgress").innerHTML=clients.map(c=>{const a=tasks.filter(t=>t.client_id===c.id),v=a.length?Math.round(a.reduce((s,t)=>s+pct(t),0)/a.length):0;return `<div class="client-row"><div class="client-head"><b>${esc(c.name)}</b><span>${v}% · ${a.length} tasks</span></div><div class="bar"><span style="width:${v}%"></span></div></div>`;}).join("")||'<div class="empty">No client records available.</div>';
 const vals=[["Completed",done,"#159d91"],["In progress",active,"#4778bd"],["Pending",pending,"#dce2eb"],["Overdue",late,"#c94c4c"]],den=total||1;
 $("distribution").innerHTML='<div class="distribution">'+vals.map(x=>`<span style="width:${x[1]/den*100}%;background:${x[2]}"></span>`).join("")+'</div>'+vals.map(x=>`<div class="client-head"><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
 const due=tasks.filter(t=>t.status!=="completed").sort((a,b)=>(a.due_date||"").localeCompare(b.due_date||"")).slice(0,6);
 $("upcoming").innerHTML=due.map(t=>`<div class="client-head" style="padding:10px 0;border-bottom:1px solid var(--line)"><span><b>${esc(t.title)}</b><small>${esc(t.clients?.name||"")} · ${esc(t.assignee_name||"Unassigned")}</small></span><span>${esc(t.due_date||"—")}<small>${overdue(t)?"OVERDUE":"Due date"}</small></span></div>`).join("")||'<div class="empty">No outstanding tasks.</div>';
}
function renderClients(){
 const q=($("clientSearch")?.value||"").toLowerCase();
 $("clientTable").innerHTML=clients.filter(c=>c.name.toLowerCase().includes(q)).map(c=>{const a=tasks.filter(t=>t.client_id===c.id),v=a.length?Math.round(a.reduce((s,t)=>s+pct(t),0)/a.length):0;return `<tr><td><b>${esc(c.name)}</b><small>${esc(c.contact_name||"")}</small></td><td>${esc(c.industry||"—")}</td><td>${engagements.filter(e=>e.client_id===c.id).length}</td><td>${a.length}</td><td>${v}%</td></tr>`;}).join("")||'<tr><td colspan="5" class="empty">No clients found.</td></tr>';
}
function renderTasks(){
 const q=($("taskSearch")?.value||"").toLowerCase(),fc=$("filterClient")?.value||"",fs=$("filterStatus")?.value||"";
 const rows=tasks.filter(t=>(!q||[t.title,t.area,t.assignee_name,t.clients?.name,t.engagements?.name].join(" ").toLowerCase().includes(q))&&(!fc||t.client_id===fc)&&(!fs||t.status===fs));
 $("taskTable").innerHTML=rows.map(t=>`<tr><td><b>${esc(t.title)}</b><small>${esc(t.area||"")}${t.subtask?" · "+esc(t.subtask):""}</small></td><td>${esc(t.clients?.name||"—")}<small>${esc(t.engagements?.name||"")}</small></td><td>${esc(t.assignee_name||"Unassigned")}<small>Reviewer: ${esc(t.reviewer_name||"—")}</small></td><td>${esc(t.priority||"Medium")}</td><td>${esc(t.due_date||"—")}</td><td><span class="pill ${overdue(t)?"late":t.status==="completed"?"done":t.status==="in_progress"?"progress":t.status==="under_review"?"review":""}">${overdue(t)?"Overdue":statusLabel(t.status)}</span></td><td>${pct(t)}%</td></tr>`).join("")||'<tr><td colspan="7" class="empty">No tasks match the selected filters.</td></tr>';
}
function renderTeam(){
 const names=[...new Set(tasks.map(t=>t.assignee_name).filter(Boolean))];
 $("teamTable").innerHTML=names.map(n=>{const a=tasks.filter(t=>t.assignee_name===n),d=a.filter(t=>t.status==="completed").length;return `<tr><td><b>${esc(n)}</b></td><td>${a.length}</td><td>${d}</td><td>${a.length-d}</td><td>${a.length?Math.round(d/a.length*100):0}%</td></tr>`;}).join("")||'<tr><td colspan="5" class="empty">No assigned tasks yet.</td></tr>';
}
function renderReports(){
 const hours=tasks.reduce((s,t)=>s+Number(t.budgeted_hours||0),0),late=tasks.filter(overdue).length,done=tasks.filter(t=>t.status==="completed").length;
 $("reportContent").innerHTML=`<div class="cards"><div class="card"><div class="card-label">Completion rate</div><div class="card-value">${tasks.length?Math.round(done/tasks.length*100):0}%</div></div><div class="card"><div class="card-label">Overdue rate</div><div class="card-value">${tasks.length?Math.round(late/tasks.length*100):0}%</div></div><div class="card"><div class="card-label">Audit areas</div><div class="card-value">${new Set(tasks.map(t=>t.area).filter(Boolean)).size}</div></div><div class="card"><div class="card-label">Budgeted hours</div><div class="card-value">${hours}</div></div></div>`;
}
function populateFilters(){
 const opts=clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
 $("filterClient").innerHTML='<option value="">All clients</option>'+opts;
 $("taskClient").innerHTML='<option value="">Select client</option>'+opts;
}
$("newTask").onclick=()=>{populateFilters();modal("taskModal",true);};
$("cancelTask").onclick=()=>modal("taskModal",false);
$("addClient").onclick=()=>modal("clientModal",true);
$("cancelClient").onclick=()=>modal("clientModal",false);
$("clientSearch").addEventListener("input",renderClients);
$("taskSearch").addEventListener("input",renderTasks);
$("filterClient").addEventListener("change",renderTasks);
$("filterStatus").addEventListener("change",renderTasks);
$("clientForm").addEventListener("submit",async e=>{
 e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const {data,error}=await supabase.from("clients").insert({name:d.name.trim(),industry:d.industry||null,contact_name:d.contact_name||null,created_by:currentUser.id}).select().single();
 if(error){alert(error.message);return;}if(d.engagement_name?.trim()){const {error:ee}=await supabase.from("engagements").insert({client_id:data.id,name:d.engagement_name.trim(),financial_year:"2026-27",status:"planning",created_by:currentUser.id});if(ee)alert("Client saved; engagement could not be created: "+ee.message);}
 e.target.reset();modal("clientModal",false);await refreshData();
});
$("taskForm").addEventListener("submit",async e=>{
 e.preventDefault();const d=Object.fromEntries(new FormData(e.target));
 const engagement=engagements.find(x=>x.client_id===d.client&&x.name===d.engagement);
 let engagementId=engagement?.id;
 if(!engagementId){const {data,error}=await supabase.from("engagements").insert({client_id:d.client,name:d.engagement,financial_year:"2026-27",status:"fieldwork",created_by:currentUser.id}).select().single();if(error){alert(error.message);return;}engagementId=data.id;}
 const {error}=await supabase.from("tasks").insert({client_id:d.client,engagement_id:engagementId,title:d.title,area:d.area,subtask:d.subtask||null,assignee_name:d.assignee,reviewer_name:d.reviewer||null,priority:d.priority.toLowerCase(),due_date:d.due_date,start_date:d.start_date||null,budgeted_hours:Number(d.budgeted_hours||0),description:d.description||null,status:"pending",progress:0,created_by:currentUser.id});
 if(error){alert(error.message);return;}e.target.reset();modal("taskModal",false);await refreshData();
});
$("exportCsv").onclick=()=>{
 const header=["Task","Client","Engagement","Area","Assignee","Reviewer","Priority","Due Date","Status","Progress","Budgeted Hours"];
 const lines=[header,...tasks.map(t=>[t.title,t.clients?.name,t.engagements?.name,t.area,t.assignee_name,t.reviewer_name,t.priority,t.due_date,statusLabel(t.status),pct(t),t.budgeted_hours])];
 const csv=lines.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
 const a=document.createElement("a"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.href=url;a.download="AuditFlow_Tasks.csv";a.click();URL.revokeObjectURL(url);
};
boot().catch(err=>{console.error(err);msg("Unable to initialise AuditFlow: "+err.message,true);});