import { supabase, signOutAdmin } from "./auth.js";

const allowedOrigin = "https://ahmadfarhadcina-tech.github.io";
const allowedPath = "/AF-Marker-Admin/";

if (
  location.origin !== allowedOrigin ||
  !location.pathname.startsWith(allowedPath)
) {
  document.body.innerHTML = `
    <main style="font-family:sans-serif;padding:24px">
      <h2>Unauthorized Domain</h2>
      <p>You are not allowed to access this admin panel on this host.</p>
    </main>
  `;
  throw new Error("Unauthorized domain");
}

const ADMIN_ID = "f4052f3f-b32a-4eb7-a9f8-5b6e4c7ffc7c";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = { profiles: [], products: [], reports: [], comments: [], likes: [], wishlists: [], follows: [], commentLikes: [], snapshotChart: null, statusChart: null };
const titles = {overview:"Overview",profiles:"Users & profiles",products:"Products",reports:"Reports",comments:"Comments",engagement:"Engagement"};
const esc = (v="") => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date = v => v ? new Date(v).toLocaleDateString() : "—";
const money = v => v == null ? "—" : Number(v).toLocaleString();
const initials = s => (String(s||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase() || "?");
function notice(msg, type="success"){ const n=$("#notice"); n.textContent=msg; n.className=`notice ${type}`; window.scrollTo({top:0,behavior:"smooth"}); setTimeout(()=>n.classList.add("hidden"),5000); }
function statusBadge(status){ const s=String(status||"active").toLowerCase(); const cls=["blocked","rejected","deleted","banned"].includes(s)?"blocked":["pending","review"].includes(s)?"pending":["inactive","paused","draft"].includes(s)?"inactive":""; return `<span class="badge ${cls}">${esc(s)}</span>`; }
function table(headers, rows, empty="No records found"){ return rows.length ? `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="empty">${empty}</div>`; }

async function guardedInit(){
  const {data:{user},error}=await supabase.auth.getUser();
  if(error || !user){ location.replace("./index.html"); return; }
  if(user.id!==ADMIN_ID){ await supabase.auth.signOut(); location.replace("./index.html"); return; }
  $("#admin-email").textContent=user.email || "Authorized administrator";
  $("#today").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"});
  await loadAll();
}
async function fetchTable(table, columns="*"){
  const {data,error}=await supabase.from(table).select(columns);
  if(error) throw new Error(`${table}: ${error.message}`);
  return data||[];
}
async function loadAll(){
  $("#refresh").disabled=true;
  try{
    const results=await Promise.allSettled([
      fetchTable("profiles"),fetchTable("products"),fetchTable("product_reports"),fetchTable("product_comments"),
      fetchTable("product_likes"),fetchTable("product_wishlists"),fetchTable("followers"),fetchTable("comment_likes")
    ]);
    const keys=["profiles","products","reports","comments","likes","wishlists","follows","commentLikes"];
    const failures=[];
    results.forEach((r,i)=>{ if(r.status==="fulfilled") state[keys[i]]=r.value; else {state[keys[i]]=[];failures.push(r.reason?.message||String(r.reason));} });
    renderAll();
    if(failures.length) notice("Some tables could not be loaded: "+failures.join(" | "),"error");
  }catch(e){notice(e.message,"error")}finally{$("#refresh").disabled=false}
}
function renderAll(){
  $("#stat-users").textContent=state.profiles.length; $("#stat-products").textContent=state.products.length;
  $("#stat-reports").textContent=state.reports.length; $("#stat-comments").textContent=state.comments.length;
  $("#stat-likes").textContent=state.likes.length; $("#stat-wishlists").textContent=state.wishlists.length;
  $("#stat-follows").textContent=state.follows.length; $("#stat-comment-likes").textContent=state.commentLikes.length;
  $("#users-nav-count").textContent=state.profiles.length; $("#products-nav-count").textContent=state.products.length; $("#reports-nav-count").textContent=state.reports.length;
  renderCharts(); renderRecent(); renderProfiles(); renderProducts(); renderReports(); renderComments(); renderEngagement();
}
function renderCharts(){
  if(!window.Chart)return;
  if(state.snapshotChart)state.snapshotChart.destroy();
  state.snapshotChart=new Chart($("#snapshot-chart"),{type:"bar",data:{labels:["Users","Products","Reports","Comments"],datasets:[{label:"Records",data:[state.profiles.length,state.products.length,state.reports.length,state.comments.length],backgroundColor:["#a8c4ff","#c9b8ff","#ffdca0","#9fe4c2"],borderRadius:7,borderSkipped:false,maxBarThickness:45}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:"#7c8799",font:{size:10}}},y:{beginAtZero:true,ticks:{precision:0,color:"#929bad",font:{size:10}},grid:{color:"#f0f2f6"}}}}});
  const counts={};state.products.forEach(p=>{const s=p.status||"active";counts[s]=(counts[s]||0)+1});const labels=Object.keys(counts);const colors=["#22ad7b","#7697ef","#f0b94f","#b19aec","#ed8c8c","#9ba6b7"];
  if(state.statusChart)state.statusChart.destroy();
  state.statusChart=new Chart($("#status-chart"),{type:"doughnut",data:{labels:labels.length?labels:["No products"],datasets:[{data:labels.length?labels.map(x=>counts[x]):[1],backgroundColor:labels.length?labels.map((_,i)=>colors[i%colors.length]):["#edf0f5"],borderWidth:0,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:"72%",plugins:{legend:{display:false}}}});
  $("#status-legend").innerHTML=labels.map((l,i)=>`<span style="--legend:${colors[i%colors.length]}">${esc(l)} ${counts[l]}</span>`).join("");
}
function renderRecent(){
  const rows=[...state.products].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,5).map(p=>`<tr><td><div class="user-cell"><div class="user-avatar">${esc(initials(p.title))}</div><div><b>${esc(p.title||"Untitled product")}</b><small>${esc(p.category||"Uncategorized")}</small></div></div></td><td>${money(p.price)}</td><td>${statusBadge(p.status)}</td><td>${date(p.created_at)}</td></tr>`);
  $("#recent-products").innerHTML=table(["Product","Price","Status","Created"],rows,"No products yet.");
}
function renderProfiles(){
  const q=($("#profiles-search")?.value||"").toLowerCase();
  const data=state.profiles.filter(p=>[p.full_name,p.username,p.city,p.whatsapp,p.bio].some(x=>String(x||"").toLowerCase().includes(q)));
  const rows=data.map(p=>`<tr><td><div class="user-cell">${p.avatar_url?`<img class="user-avatar" src="${esc(p.avatar_url)}" alt="">`:`<span class="user-avatar">${esc(initials(p.full_name||p.username))}</span>`}<div><b>${esc(p.full_name||"Unnamed user")}</b><small>@${esc(p.username||"no-username")}</small></div></div></td><td>${esc(p.city||"—")}</td><td>${esc(p.whatsapp||"—")}</td><td>${date(p.created_at)}</td><td><div class="row-actions"><button class="action-btn" data-action="view-profile" data-id="${esc(p.id)}">Details</button><button class="action-btn" data-action="edit-profile" data-id="${esc(p.id)}">Edit</button><button class="action-btn delete" data-action="delete-profile" data-id="${esc(p.id)}">Delete</button></div></td></tr>`);
  $("#profiles-table").innerHTML=table(["User","City","WhatsApp","Joined","Actions"],rows);
}
function renderProducts(){
  const q=($("#products-search")?.value||"").toLowerCase();
  const data=state.products.filter(p=>[p.title,p.category,p.city,p.description,p.status].some(x=>String(x||"").toLowerCase().includes(q)));
  const rows=data.map(p=>`<tr><td><div class="user-cell"><div class="user-avatar">${esc(initials(p.title))}</div><div><b>${esc(p.title||"Untitled")}</b><small>${esc(p.city||"No city")}</small></div></div></td><td>${money(p.price)}</td><td>${esc(p.category||"—")}</td><td>${statusBadge(p.status)}</td><td>${date(p.created_at)}</td><td><div class="row-actions"><button class="action-btn" data-action="edit-product" data-id="${esc(p.id)}">Edit</button><button class="action-btn delete" data-action="delete-product" data-id="${esc(p.id)}">Delete</button></div></td></tr>`);
  $("#products-table").innerHTML=table(["Product","Price","Category","Status","Created","Actions"],rows);
}
function renderReports(){
  const rows=state.reports.map(r=>{const p=state.products.find(x=>x.id===r.product_id);const u=state.profiles.find(x=>x.id===r.user_id);return `<tr><td>#${esc(r.id)}</td><td>${esc(p?.title||r.product_id||"Unknown product")}</td><td>${esc(u?.full_name||u?.username||r.user_id||"Unknown user")}</td><td>${esc(r.reason||"—")}</td><td>${date(r.created_at)}</td><td><div class="row-actions"><button class="action-btn" data-action="report-details" data-id="${esc(r.id)}">Details</button><button class="action-btn delete" data-action="delete-report" data-id="${esc(r.id)}">Resolve / remove</button></div></td></tr>`});
  $("#reports-table").innerHTML=table(["ID","Product","Reported by","Reason","Date","Actions"],rows,"No reports. Nice!");
}
function renderComments(){
  const q=($("#comments-search")?.value||"").toLowerCase();
  const data=state.comments.filter(c=>String(c.comment||"").toLowerCase().includes(q));
  const rows=data.map(c=>{const u=state.profiles.find(x=>x.id===c.user_id);const p=state.products.find(x=>x.id===c.product_id);return `<tr><td><div class="user-cell"><span class="user-avatar">${esc(initials(u?.full_name||u?.username))}</span><div><b>${esc(u?.full_name||u?.username||"Unknown user")}</b><small>${esc(p?.title||"Unknown product")}</small></div></div></td><td>${esc(c.comment||"")}</td><td>${c.rating==null?"—":esc(c.rating)}</td><td>${date(c.created_at)}</td><td><button class="action-btn delete" data-action="delete-comment" data-id="${esc(c.id)}">Delete</button></td></tr>`});
  $("#comments-table").innerHTML=table(["User / product","Comment","Rating","Date","Actions"],rows);
}
function renderEngagement(){
  const sets=[["Product likes",state.likes],["Wishlists",state.wishlists],["Followers",state.follows],["Comment likes",state.commentLikes]];
  $("#engagement-tables").innerHTML=sets.map(([title,rows])=>`<div class="engagement-card"><h4>${title} <span class="badge">${rows.length}</span></h4><p>Showing up to 5 recent records.</p><div class="table-wrap">${table(["Record","Date"],rows.slice(0,5).map(r=>`<tr><td>${esc(r.product_id||r.comment_id||((r.follower_id||"")+" → "+(r.following_id||""))||r.id)}</td><td>${date(r.created_at)}</td></tr>`),"No records")}</div></div>`).join("");
}
function switchView(view){
  $$(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${view}`));
  $$(".nav-item").forEach(v=>v.classList.toggle("active",v.dataset.view===view));
  $("#page-title").textContent=titles[view]||"Overview";$("#sidebar").classList.remove("open");
}
function showModal(title,body,onSave,label="Save changes"){
  const root=$("#modal-root");root.innerHTML=`<div class="modal-backdrop"><form class="modal"><div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="action-btn" data-close>✕</button></div><div class="modal-body">${body}</div><div class="modal-foot"><button type="button" class="button button-light" data-close>Cancel</button><button type="submit" class="button button-primary">${esc(label)}</button></div></form></div>`;
  const form=root.querySelector("form");root.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>root.innerHTML="");root.querySelector(".modal-backdrop").onclick=e=>{if(e.target.classList.contains("modal-backdrop"))root.innerHTML=""};
  form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('[type="submit"]');btn.disabled=true;btn.textContent="Saving…";try{await onSave(new FormData(form));root.innerHTML="";await loadAll();notice("Saved successfully.");}catch(err){btn.disabled=false;btn.textContent=label;notice(err.message||String(err),"error")}};
}
const input=(name,label,value="",type="text",opts={})=>`<div class="field ${opts.full?"full":""}"><label for="f-${name}">${esc(label)}</label>${opts.textarea?`<textarea id="f-${name}" name="${name}">${esc(value)}</textarea>`:opts.select?`<select id="f-${name}" name="${name}">${opts.select.map(x=>`<option value="${esc(x)}" ${String(value)===x?"selected":""}>${esc(x)}</option>`).join("")}</select>`:`<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${opts.required?"required":""} ${opts.step?`step="${opts.step}"`:""}>`}</div>`;
function editProfile(p){
  showModal("Edit user profile",`<div class="modal-grid">${input("full_name","Full name",p.full_name||"")}${input("username","Username",p.username||"")}${input("city","City",p.city||"")}${input("whatsapp","WhatsApp",p.whatsapp||"")}${input("avatar_url","Avatar URL",p.avatar_url||"","url",{full:true})}${input("bio","Bio",p.bio||"","text",{full:true,textarea:true})}</div><p class="help-note">Profile fields are updated in the existing profiles row. Authentication email/password are not changed from this form.</p>`,async fd=>{const patch={};["full_name","username","city","whatsapp","avatar_url","bio"].forEach(k=>patch[k]=fd.get(k)||null);const {error}=await supabase.from("profiles").update(patch).eq("id",p.id);if(error)throw error;});
}
function viewProfile(p){
  const fields=[["Profile ID",p.id],["Full name",p.full_name],["Username",p.username],["City",p.city],["WhatsApp",p.whatsapp],["Bio",p.bio],["Created",date(p.created_at)]];
  const ownProducts=state.products.filter(x=>x.seller_id===p.id);
  showModal("User profile details",`<div class="modal-grid">${fields.map(([k,v])=>`<div class="field ${k==="Bio"?"full":""}"><label>${esc(k)}</label><div style="font-size:12px;line-height:1.6;overflow-wrap:anywhere">${esc(v||"—")}</div></div>`).join("")}<div class="field full"><label>Products (${ownProducts.length})</label><div>${ownProducts.map(x=>esc(x.title)).join(", ")||"No products linked by seller_id."}</div></div></div>`,async()=>{}, "Close");
  const submit=$("#modal-root").querySelector('[type="submit"]');submit.type="button";submit.onclick=()=>$("#modal-root").innerHTML="";
}
function editProduct(p={}){
  const isEdit=!!p.id;
  showModal(isEdit?"Edit product":"Add product",`<div class="modal-grid">${input("title","Title",p.title||"","text",{required:true})}${input("price","Price",p.price??"","number",{required:true,step:"0.01"})}${input("category","Category",p.category||"")}${input("city","City",p.city||"")}${input("status","Status",p.status||"active","text",{select:["active","inactive","pending","sold","rejected"]})}${input("condition","Condition",p.condition||"")}${input("stock","Stock",p.stock??1,"number",{step:"1"})}${input("whatsapp","WhatsApp",p.whatsapp||"")}${input("image_url","Main image URL",p.image_url||"","url",{full:true})}${input("description","Description",p.description||"","text",{full:true,textarea:true})}</div><p class="help-note">For a new listing, seller ID is left empty unless you provide one. Ensure required columns and any marketplace-specific rules are respected.</p>`,async fd=>{
    const patch={title:fd.get("title"),price:Number(fd.get("price")),category:fd.get("category")||null,city:fd.get("city")||null,status:fd.get("status")||"active",condition:fd.get("condition")||null,stock:fd.get("stock")===""?null:Number(fd.get("stock")),whatsapp:fd.get("whatsapp")||null,image_url:fd.get("image_url")||null,description:fd.get("description")||null};
    let result;if(isEdit)result=await supabase.from("products").update(patch).eq("id",p.id);else result=await supabase.from("products").insert(patch);
    if(result.error)throw result.error;
  },isEdit?"Save product":"Create product");
}
async function removeRecord(table,id,label){
  if(!confirm(`Delete this ${label}? This action cannot be undone.`))return;
  const {error}=await supabase.from(table).delete().eq("id",id);
  if(error)throw error;
  await loadAll();notice(`${label[0].toUpperCase()+label.slice(1)} deleted.`);
}
async function deleteProfile(id){
  const p=state.profiles.find(x=>String(x.id)===String(id));if(!p)return;
  const related=state.products.filter(x=>x.seller_id===p.id).length;
  if(!confirm(`Delete profile ${p.full_name||p.username||p.id}?${related?` It has ${related} linked product(s).`:""} This may fail if database foreign-key rules prevent deletion. It does not delete the Auth account.`))return;
  const {error}=await supabase.from("profiles").delete().eq("id",p.id);if(error)throw error;await loadAll();notice("Profile deleted. Auth account, if any, was not deleted.");
}
async function actionClick(e){
  const b=e.target.closest("[data-action]");if(!b)return;const id=b.dataset.id,act=b.dataset.action;
  try{
    if(act==="view-profile")viewProfile(state.profiles.find(x=>String(x.id)===String(id)));
    if(act==="edit-profile")editProfile(state.profiles.find(x=>String(x.id)===String(id)));
    if(act==="delete-profile")await deleteProfile(id);
    if(act==="edit-product")editProduct(state.products.find(x=>String(x.id)===String(id)));
    if(act==="delete-product")await removeRecord("products",id,"product");
    if(act==="delete-report")await removeRecord("product_reports",id,"report");
    if(act==="delete-comment")await removeRecord("product_comments",id,"comment");
    if(act==="report-details"){const r=state.reports.find(x=>String(x.id)===String(id));showModal("Report details",`<div class="modal-grid">${[["Report ID",r?.id],["Product ID",r?.product_id],["User ID",r?.user_id],["Reason",r?.reason],["Created",date(r?.created_at)]].map(([k,v])=>`<div class="field"><label>${esc(k)}</label><div style="font-size:12px;overflow-wrap:anywhere">${esc(v||"—")}</div></div>`).join("")}</div>`,async()=>{},"Close");const s=$("#modal-root").querySelector('[type="submit"]');s.type="button";s.onclick=()=>$("#modal-root").innerHTML="";}
  }catch(err){notice(err.message||String(err),"error")}
}
$("#main-nav").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(b)switchView(b.dataset.view)});
document.addEventListener("click",actionClick);
$$("[data-goto]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.goto)));
$("#refresh").addEventListener("click",loadAll);
$("#profiles-reload").addEventListener("click",loadAll);$("#reports-reload").addEventListener("click",loadAll);$("#engagement-reload").addEventListener("click",loadAll);
$("#profiles-search").addEventListener("input",renderProfiles);$("#products-search").addEventListener("input",renderProducts);$("#comments-search").addEventListener("input",renderComments);
$("#add-product").addEventListener("click",()=>editProduct());
$("#signout").addEventListener("click",async()=>{try{await signOutAdmin()}finally{location.replace("./index.html")}});
$("#menu-toggle").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
guardedInit();
