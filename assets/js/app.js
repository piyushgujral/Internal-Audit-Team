import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, onValue, query, orderByChild, equalTo, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getDatabase(app);
const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
const $ = id => document.getElementById(id), esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const today = new Date().toISOString().slice(0, 10), roles = ["pending", "Admin", "Manager", "Senior", "Auditor", "Read-only"];
let user = null, profile = null, users = {}, clients = {}, engagements = {}, tasks = {}, stops = [], scopedStops = [], pendingMessage = "";
const values = obj => Object.entries(obj || {}).map(([id, value]) => ({ id, ...value }));
const isAdmin = () => profile?.role === "Admin", canManage = () => isAdmin() || profile?.role === "Manager";
const notify = (message, error = false) => { const box = $("toast"); box.textContent = message; box.className = `toast ${error ? "error" : ""}`; box.classList.add("show"); setTimeout(() => box.classList.remove("show"), 3800); };
const modal = (name, open) => $(`${name}Modal`).classList.toggle("show", open);

function showLogin(message = "") { $("loginView").classList.remove("hidden"); $("app").classList.add("hidden"); $("loginMessage").textContent = message; }
function showApp() { $("loginView").classList.add("hidden"); $("app").classList.remove("hidden"); $("welcome").textContent = `${profile.displayName || user.displayName || user.email} · ${profile.role}`; document.querySelectorAll("[data-admin]").forEach(el => el.classList.toggle("hidden", !isAdmin())); document.querySelectorAll("[data-manager]").forEach(el => el.classList.toggle("hidden", !canManage())); }
function listen(path, callback) { const r = ref(db, path); stops.push(onValue(r, snap => { callback(snap.val() || {}); renderAll(); }, error => notify(error.message, true))); }
function loadMemberScope(access) {
  scopedStops.forEach(stop => stop()); scopedStops = []; clients = {}; engagements = {}; tasks = {};
  const engagementRows = {}, taskRows = {};
  const publish = () => { engagements = Object.assign({}, ...Object.values(engagementRows)); tasks = Object.assign({}, ...Object.values(taskRows)); renderAll(); };
  for (const clientId of Object.keys(access || {}).filter(id => access[id] === true)) {
    scopedStops.push(onValue(ref(db, `clients/${clientId}`), snap => { if (snap.exists()) clients[clientId] = snap.val(); else delete clients[clientId]; renderAll(); }, error => notify(error.message, true)));
    scopedStops.push(onValue(query(ref(db, "engagements"), orderByChild("clientId"), equalTo(clientId)), snap => { engagementRows[clientId] = snap.val() || {}; publish(); }, error => notify(error.message, true)));
    scopedStops.push(onValue(query(ref(db, "tasks"), orderByChild("clientId"), equalTo(clientId)), snap => { taskRows[clientId] = snap.val() || {}; publish(); }, error => notify(error.message, true)));
  }
  renderAll();
}

onAuthStateChanged(auth, async signedIn => {
  [...stops, ...scopedStops].forEach(stop => stop()); stops = []; scopedStops = []; users = {}; clients = {}; engagements = {}; tasks = {}; user = signedIn; profile = null;
  if (!user) { showLogin(pendingMessage); pendingMessage = ""; return; }
  try {
    const pRef = ref(db, `users/${user.uid}`), snap = await get(pRef);
    if (!snap.exists()) { await set(pRef, { uid: user.uid, email: user.email || "", displayName: user.displayName || "", role: "pending", active: false, createdAt: serverTimestamp() }); pendingMessage="Your Google account is registered and awaiting administrator approval. Ask your AuditFlow admin to activate it."; await signOut(auth); return; }
    profile = snap.val();
    if (!profile.active || profile.role === "pending") { pendingMessage="Your account is awaiting administrator approval."; await signOut(auth); return; }
    showApp();
    if (canManage()) {
      listen("users", data => { users = data; });
      listen("clients", data => { clients = data; });
      listen("engagements", data => { engagements = data; });
      listen("tasks", data => { tasks = data; });
    } else {
      users[user.uid] = profile;
      listen(`users/${user.uid}/clientAccess`, access => { users[user.uid].clientAccess = access; loadMemberScope(access); });
    }
  } catch (error) { notify(`Unable to open workspace: ${error.message}`, true); showLogin("Firebase could not load your profile. Check setup and database rules."); }
});

$("googleSignIn").addEventListener("click", async () => { try { await signInWithPopup(auth, provider); } catch (e) { showLogin(e.message); } });
$("signOut").addEventListener("click", () => signOut(auth));
document.querySelectorAll(".nav[data-page]").forEach(link => link.addEventListener("click", () => { document.querySelectorAll(".page").forEach(page => page.classList.toggle("active", page.id === link.dataset.page)); document.querySelectorAll(".nav").forEach(n => n.classList.toggle("active", n === link)); $("pageTitle").textContent = link.dataset.title; renderAll(); }));

function renderAll() { if (!profile) return; renderDashboard(); renderClients(); renderEngagements(); renderTasks(); renderTeam(); renderAdmin(); populateSelectors(); }
function renderDashboard() {
 const cs=values(clients), es=values(engagements), ts=values(tasks), done=ts.filter(t=>t.status==="Completed").length, late=ts.filter(t=>t.status!=="Completed"&&t.dueDate<today).length;
 $("kpis").innerHTML=[["Clients",cs.length],["Engagements",es.length],["Open tasks",ts.filter(t=>t.status!=="Completed").length],["Overdue",late]].map(([a,b])=>`<div class="card"><span>${a}</span><strong>${b}</strong></div>`).join("");
 $("clientProgress").innerHTML=cs.map(c=>{const a=ts.filter(t=>t.clientId===c.id),n=a.length?Math.round(a.reduce((s,t)=>s+(t.status==="Completed"?100:Number(t.progress||0)),0)/a.length):0;return `<div class="client-row"><div class="client-head"><b>${esc(c.name)}</b><span>${n}%</span></div><div class="bar"><i style="width:${n}%"></i></div></div>`}).join("")||"<p class=empty>No assigned clients yet.</p>";
 $("upcoming").innerHTML=ts.filter(t=>t.status!=="Completed").sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||"")).slice(0,6).map(t=>`<div class="client-head row"><span><b>${esc(t.title)}</b><small>${esc(clients[t.clientId]?.name||"")}</small></span><span>${esc(t.dueDate||"—")}</span></div>`).join("")||"<p class=empty>No open tasks.</p>";
 $("distribution").innerHTML=["Pending","In Progress","Under Review","Completed","On Hold"].map(s=>`<span class="pill">${s}: ${ts.filter(t=>t.status===s).length}</span>`).join(" ");
}
function renderClients() { const q=$("clientSearch").value.toLowerCase(); $("clientTable").innerHTML=values(clients).filter(c=>c.name.toLowerCase().includes(q)).map(c=>`<tr><td><b>${esc(c.name)}</b><small>${esc(c.industry||"")}</small></td><td>${values(engagements).filter(e=>e.clientId===c.id).length}</td><td>${values(tasks).filter(t=>t.clientId===c.id).length}</td><td>${esc(c.status||"Active")}</td></tr>`).join("")||'<tr><td colspan="4" class="empty">No clients found.</td></tr>'; }
function renderEngagements() { $("engagementTable").innerHTML=values(engagements).map(e=>`<tr><td><b>${esc(e.name)}</b></td><td>${esc(clients[e.clientId]?.name||"—")}</td><td>${esc(e.financialYear||"—")}</td><td>${esc(e.leadName||"Unassigned")}</td><td><span class="pill">${esc(e.status||"Planning")}</span></td></tr>`).join("")||'<tr><td colspan="5" class="empty">No engagements yet.</td></tr>'; }
function renderTasks() { const q=$("taskSearch").value.toLowerCase(), filter=$("statusFilter").value; $("taskTable").innerHTML=values(tasks).filter(t=>(!filter||t.status===filter)&&(!q||`${t.title} ${clients[t.clientId]?.name} ${t.assignedName}`.toLowerCase().includes(q))).map(t=>`<tr><td><b>${esc(t.title)}</b><small>${esc(t.area||"")}</small></td><td>${esc(clients[t.clientId]?.name||"—")}<small>${esc(engagements[t.engagementId]?.name||"")}</small></td><td>${esc(t.assignedName||"Unassigned")}</td><td>${esc(t.dueDate||"—")}</td><td><select data-status="${t.id}" ${!(isAdmin()||canManage()||(["Senior","Auditor"].includes(profile.role)&&t.assignedTo===user.uid))?"disabled":""}>${["Pending","In Progress","Under Review","Completed","On Hold"].map(s=>`<option ${s===t.status?"selected":""}>${s}</option>`).join("")}</select></td><td>${Number(t.progress||0)}%</td></tr>`).join("")||'<tr><td colspan="6" class="empty">No tasks found.</td></tr>'; document.querySelectorAll("[data-status]").forEach(el=>el.onchange=async()=>{try{await update(ref(db,`tasks/${el.dataset.status}`),{status:el.value,progress:el.value==="Completed"?100:Number(tasks[el.dataset.status].progress||0),updatedAt:serverTimestamp()});}catch(e){notify(e.message,true);}}); }
function renderTeam() { $("teamTable").innerHTML=values(users).filter(p=>p.active).map(p=>{const assigned=values(tasks).filter(t=>t.assignedTo===p.uid),closed=assigned.filter(t=>t.status==="Completed").length;return `<tr><td>${esc(p.displayName||p.email)}</td><td>${assigned.length}</td><td>${closed}</td><td>${assigned.length-closed}</td></tr>`}).join("")||'<tr><td colspan="4" class="empty">No team members are visible.</td></tr>'; }
function renderAdmin() { if(!isAdmin())return; $("userTable").innerHTML=values(users).map(p=>`<tr><td><b>${esc(p.displayName||"New user")}</b><small>${esc(p.email)}</small></td><td><select data-role="${p.uid}" ${p.uid===user.uid?"disabled":""}>${roles.map(r=>`<option ${p.role===r?"selected":""}>${r}</option>`).join("")}</select></td><td><input type="checkbox" data-active="${p.uid}" ${p.active?"checked":""} ${p.uid===user.uid?"disabled":""}></td><td>${p.uid===user.uid?"You":`<button class="btn secondary" data-access="${p.uid}">Client access</button>`}</td></tr>`).join(""); document.querySelectorAll("[data-role]").forEach(el=>el.onchange=()=>adminUpdate(el.dataset.role,{role:el.value}));document.querySelectorAll("[data-active]").forEach(el=>el.onchange=()=>adminUpdate(el.dataset.active,{active:el.checked}));document.querySelectorAll("[data-access]").forEach(el=>el.onclick=()=>openAccess(el.dataset.access)); }
async function adminUpdate(uid, patch) { try { await update(ref(db,`users/${uid}`),{...patch,updatedAt:serverTimestamp()});notify("Employee updated."); } catch(e) { notify(e.message,true); renderAdmin(); } }
function populateSelectors() { const cs=values(clients), es=values(engagements); ["engClient","taskClient"].forEach(id=>{const el=$(id);if(el)el.innerHTML=cs.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}); if($("taskEngagement"))$("taskEngagement").innerHTML=es.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join(""); const people=values(users).filter(p=>p.active&&p.uid); if($("taskAssignee"))$("taskAssignee").innerHTML=people.map(p=>`<option value="${p.uid}">${esc(p.displayName||p.email)}</option>`).join(""); if($("engLead"))$("engLead").innerHTML='<option value="">Unassigned</option>'+people.map(p=>`<option value="${p.uid}">${esc(p.displayName||p.email)}</option>`).join(""); }
async function addRecord(path, data) { const rowRef=push(ref(db,path)); await set(rowRef,{...data,createdAt:serverTimestamp(),createdBy:user.uid}); }
$("clientForm").addEventListener("submit",async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await addRecord("clients",{name:d.name.trim(),industry:d.industry.trim(),status:"Active"});e.target.reset();modal("client",false);notify("Client created.");}catch(x){notify(x.message,true);}});
$("engagementForm").addEventListener("submit",async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await addRecord("engagements",{clientId:d.clientId,name:d.name.trim(),financialYear:d.financialYear,status:d.status,leadId:d.leadId||"",leadName:users[d.leadId]?.displayName||users[d.leadId]?.email||""});e.target.reset();modal("engagement",false);notify("Engagement created.");}catch(x){notify(x.message,true);}});
$("taskForm").addEventListener("submit",async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await addRecord("tasks",{clientId:d.clientId,engagementId:d.engagementId,title:d.title.trim(),area:d.area.trim(),assignedTo:d.assignedTo,assignedName:users[d.assignedTo]?.displayName||users[d.assignedTo]?.email||"",reviewer:d.reviewer||"",dueDate:d.dueDate,priority:d.priority,status:"Pending",progress:0});e.target.reset();modal("task",false);notify("Task created.");}catch(x){notify(x.message,true);}});
$("inviteInfo").addEventListener("click",()=>notify("Employees sign in once with Google. Their pending profiles appear here for role assignment."));
$("exportCsv").onclick=()=>{const rows=[["Task","Client","Engagement","Assignee","Due date","Status"],...values(tasks).map(t=>[t.title,clients[t.clientId]?.name,engagements[t.engagementId]?.name,t.assignedName,t.dueDate,t.status])];const csv=rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="auditflow-tasks.csv";a.click();URL.revokeObjectURL(a.href);};
$("clientSearch").oninput=renderClients; $("taskSearch").oninput=renderTasks; $("statusFilter").onchange=renderTasks;
document.querySelectorAll("[data-modal]").forEach(b=>b.onclick=()=>modal(b.dataset.modal,true)); document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>modal(b.dataset.close,false));
async function openAccess(uid) { const p=users[uid]; const selected=Object.keys(p.clientAccess||{}); const answer=prompt(`Enter client IDs allowed for ${p.email}, separated by commas. Available: ${values(clients).map(c=>`${c.id} (${c.name})`).join(", ")}`,selected.join(","));if(answer===null)return;const access={};answer.split(",").map(x=>x.trim()).filter(Boolean).forEach(id=>access[id]=true);try{await set(ref(db,`users/${uid}/clientAccess`),access);notify("Client access saved.");}catch(e){notify(e.message,true);} }
