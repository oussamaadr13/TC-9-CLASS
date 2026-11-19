const $=s=>document.querySelector(s);
const toast=(message)=>{const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove("show"),3200)};
const sb=window.supabase.createClient(window.LEARNOVA_CONFIG.supabaseUrl,window.LEARNOVA_CONFIG.supabaseKey);
let currentUser=null,signupMode=false;
const authBackdrop=$("#authBackdrop"),classModal=$("#modalBackdrop");
function openAuth(){authBackdrop.hidden=false;$("#authEmail").focus()}
function closeAuth(){authBackdrop.hidden=true}
function authMode(signup){signupMode=signup;$("#authTitle").textContent=signup?"Créer ton compte LEARNOVA":"Bienvenue sur LEARNOVA";$("#authDescription").textContent=signup?"Rejoins ton espace d'apprentissage.":"Connecte-toi pour retrouver tes classes et tes révisions.";$("#displayNameWrap").hidden=!signup;$("#authSubmit").textContent=signup?"Créer mon compte →":"Se connecter →";$("#authToggle").textContent=signup?"J'ai déjà un compte":"Créer un compte"}
async function refreshClasses(){
 const grid=$("#classGrid"); if(!grid)return;
 const {data,error}=await sb.from("classes").select("id,name,description,subject,created_at,admin_id").order("created_at",{ascending:false});
 if(error){toast("Impossible de charger les classes : "+error.message);return}
 grid.innerHTML="";
 if(!data.length){grid.innerHTML='<div class="empty-classes">Pas encore de classe. Crée la première pour commencer !</div>';return}
 const palette=["class-purple","class-green","class-orange"],letters=["M","S","L","✦"];
 data.forEach((c,i)=>{const el=document.createElement("article");el.className="class-card "+palette[i%3];const top=document.createElement("div");top.className="class-card-top";const symbol=document.createElement("span");symbol.className="class-symbol";symbol.textContent=letters[i%4];const menu=document.createElement("span");menu.className="class-menu";menu.textContent="LEARNOVA";top.append(symbol,menu);const meta=document.createElement("div");meta.className="class-meta";meta.textContent=c.subject||"CLASSE";const h=document.createElement("h3");h.textContent=c.name;const p=document.createElement("p");p.textContent=c.description||"Espace de travail et de révision.";const foot=document.createElement("div");foot.className="class-footer";const note=document.createElement("span");note.textContent="Classe privée";foot.append(note);if(c.admin_id===currentUser.id){const invite=document.createElement("button");invite.type="button";invite.textContent="Inviter";invite.addEventListener("click",()=>createInvite(c.id));foot.append(invite)}el.append(top,meta,h,p,foot);grid.append(el)});
}

async function createInvite(classId){
 try{
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const token=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  const {error}=await sb.from("class_invites").insert({class_id:classId,created_by:currentUser.id,token_hash:hash,expires_at:new Date(Date.now()+7*86400000).toISOString(),max_uses:30});
  if(error)throw error;
  const link=location.origin+location.pathname+"?join="+token;
  await navigator.clipboard.writeText(link);
  toast("Lien d'invitation copié. Valable 7 jours (30 utilisations).");
 }catch(err){toast("Impossible de créer le lien : "+(err.message||"erreur"))}
}
async function redeemInviteFromUrl(){
 const params=new URLSearchParams(location.search),token=params.get("join");
 if(!token)return;
 const {data:{session}}=await sb.auth.getSession();
 if(!session){toast("Connecte-toi ou crée un compte pour rejoindre cette classe.");openAuth();return}
 const {data,error}=await sb.rpc("redeem_class_invite",{invite_token:token});
 if(error){toast("Invitation refusée : "+error.message);return}
 history.replaceState({},document.title,location.pathname);
 toast("Tu as rejoint la classe avec succès !");
 await refreshClasses();
}

async function applySession(session){
 currentUser=session?.user||null;
 const authBtn=$("#authBtn");
 if(currentUser){authBtn.textContent="Se déconnecter";const name=currentUser.user_metadata?.display_name||currentUser.email?.split("@")[0]||"Étudiant";document.querySelectorAll(".profile-mini b").forEach(x=>x.textContent=name);document.querySelectorAll(".avatar-me").forEach(x=>x.textContent=name.slice(0,2).toUpperCase());await refreshClasses();await redeemInviteFromUrl()}
 else{authBtn.textContent="Se connecter"}
}
$("#authBtn").addEventListener("click",()=>currentUser?sb.auth.signOut():openAuth());
$("#authClose").addEventListener("click",closeAuth);
authBackdrop.addEventListener("click",e=>{if(e.target===authBackdrop)closeAuth()});
$("#authToggle").addEventListener("click",()=>authMode(!signupMode));
$("#authForm").addEventListener("submit",async e=>{
 e.preventDefault();const email=$("#authEmail").value.trim(),password=$("#authPassword").value;
 const button=$("#authSubmit");button.disabled=true;
 try{
  if(signupMode){const display_name=$("#displayName").value.trim()||email.split("@")[0];const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name}}});if(error)throw error;if(data.session){closeAuth();toast("Compte créé. Bienvenue sur LEARNOVA !");}else{closeAuth();toast("Compte créé. Vérifie ton email pour confirmer ton inscription.");}}
  else{const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;closeAuth();toast("Connexion réussie !")}
 }catch(err){toast(err.message||"Une erreur est survenue.")}finally{button.disabled=false}
});
const classForm=$("#classForm");
$("#createClassBtn").addEventListener("click",()=>{if(!currentUser){openAuth();toast("Connecte-toi pour créer ta classe.");return}classModal.hidden=false;$("#className").focus()});
$("#closeModal").addEventListener("click",()=>classModal.hidden=true);
classModal.addEventListener("click",e=>{if(e.target===classModal)classModal.hidden=true});
classForm.addEventListener("submit",async e=>{
 e.preventDefault();if(!currentUser){classModal.hidden=true;openAuth();return}
 const name=$("#className").value.trim();if(!name)return;
 const {error}=await sb.from("classes").insert({name,subject:$("#classSubject").value,description:"Niveau : "+$("#classLevel").value,admin_id:currentUser.id,is_private:$("#classPrivacy").value==="private"});
 if(error){toast("Erreur : "+error.message);return}
 classModal.hidden=true;classForm.reset();toast("Classe créée avec succès ! Tu es administrateur.");await refreshClasses();
});
document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{const view=btn.dataset.view;const names={overview:"Vue d'ensemble",classes:"Mes classes",discover:"Découvrir",library:"Bibliothèque",assignments:"Devoirs",calendar:"Calendrier",coach:"AI Study Coach",rooms:"Study Rooms",flashcards:"Flashcards",settings:"Paramètres"};$("#crumbCurrent").textContent=names[view]||view;document.querySelectorAll(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.view===view));if(view==="coach"){if(!currentUser){openAuth();toast("Connecte-toi pour utiliser LEARNOVA AI.");}else openCoach();}else if(view!=="overview")toast(names[view]+" : ce module sera activé dans la prochaine version.");$("#sidebar").classList.remove("open")}));
$("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
sb.auth.onAuthStateChange((_event,session)=>{applySession(session)});
sb.auth.getSession().then(({data})=>applySession(data.session));

let coachMode="coach";
function openCoach(){ $("coachBackdrop").hidden=false; $("coachInput").focus(); }
function addCoachMessage(text,role){
 const item=document.createElement("div");item.className="coach-message "+role;item.textContent=text;$("coachMessages").append(item);$("coachMessages").scrollTop=$("coachMessages").scrollHeight;
}
$("coachClose").addEventListener("click",()=>{$("coachBackdrop").hidden=true});
$("coachBackdrop").addEventListener("click",e=>{if(e.target===$("coachBackdrop"))$("coachBackdrop").hidden=true});
$("coachModeBtn").addEventListener("click",()=>{
 coachMode=coachMode==="coach"?"qcm":"coach";
 $("coachModeBtn").textContent=coachMode==="coach"?"Mode : Coach IA":"Mode : Générer un QCM";
 $("coachInputLabel").firstChild.textContent=coachMode==="coach"?"Ta question":"Colle le texte de ton cours";
 $("coachInput").placeholder=coachMode==="coach"?"Écris ta question ici…":"Colle ici le texte de ton cours pour générer 10 questions QCM…";
 $("coachHint").textContent=coachMode==="coach"?"Pose une question et demande une explication étape par étape.":"Colle le texte du cours. LEARNOVA AI créera 10 QCM avec corrigé. Import PDF à venir.";
 $("coachMessages").innerHTML="";
 addCoachMessage(coachMode==="coach"?"Pose-moi une question sur ton cours.":"Colle ton cours dans la zone ci-dessous pour créer un QCM.","assistant");
});
$("coachForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const prompt=$("coachInput").value.trim();if(!prompt)return;
 if(!currentUser){openAuth();toast("Connecte-toi pour continuer.");return}
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token){openAuth();toast("Ta session a expiré. Reconnecte-toi.");return}
 addCoachMessage(prompt,"user");$("coachInput").value="";
 const send=$("coachSend");send.disabled=true;send.textContent="LEARNOVA réfléchit…";
 try{
  const response=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({mode:coachMode,prompt})});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error||"Une erreur est survenue.");
  addCoachMessage(payload.answer,"assistant");
 }catch(err){addCoachMessage("Erreur : "+(err.message||"Impossible de contacter l'IA. Réessaie."),"assistant");}
 finally{send.disabled=false;send.textContent=coachMode==="coach"?"Envoyer à LEARNOVA AI →":"Générer mon QCM →";}
});

authMode(false);
