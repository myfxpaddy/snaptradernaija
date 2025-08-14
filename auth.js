/* global firebase, window */
if (!window.FIREBASE_CONFIG?.apiKey) {
  console.warn("Firebase config missing. Auth UI will be client-side only.");
}
let auth=null;
try{
  const app = firebase.initializeApp(window.FIREBASE_CONFIG);
  auth = firebase.auth();
}catch(e){ console.warn("Firebase init skipped", e); }

export async function getIdToken(){
  if(!auth || !auth.currentUser) return null;
  return auth.currentUser.getIdToken(/*forceRefresh*/true);
}

export function onAuthChange(cb){
  if(!auth) return cb(null);
  return auth.onAuthStateChanged(cb);
}

export function openAuthModal(mode="login"){
  const m = document.getElementById("authModal");
  const t = document.getElementById("authTitle");
  if(!m) return;
  t.textContent = mode==="signup" ? "Sign up" : "Log in";
  document.getElementById("authEmail").value="";
  document.getElementById("authPass").value="";
  m.showModal();
}

export function closeAuthModal(){
  document.getElementById("authModal")?.close();
}

export function wireAuthUI(){
  const loginBtn  = document.getElementById("loginOpenBtn");
  const signupBtn = document.getElementById("signupOpenBtn");
  const cancelBtn = document.getElementById("authCancelBtn");
  const form      = document.getElementById("authForm");
  const forgot    = document.getElementById("forgotLink");
  const dashLink  = document.getElementById("dashLink");
  const navLinks  = document.getElementById("navLinks");

  loginBtn?.addEventListener("click", ()=>openAuthModal("login"));
  signupBtn?.addEventListener("click", ()=>openAuthModal("signup"));
  cancelBtn?.addEventListener("click",(e)=>{ e.preventDefault(); closeAuthModal(); });

  form?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const pass  = document.getElementById("authPass").value.trim();
    const mode  = document.getElementById("authTitle").textContent.includes("Sign") ? "signup" : "login";
    try{
      if(!auth) throw new Error("Auth not initialized");
      if(mode==="signup") await auth.createUserWithEmailAndPassword(email, pass);
      else await auth.signInWithEmailAndPassword(email, pass);
      closeAuthModal();
      // Show Dashboard link when logged in
      dashLink?.classList.remove("hidden");
      document.querySelectorAll(".only-logged-out")?.forEach(el=>el.classList.add("hidden"));
      document.querySelectorAll(".only-logged-in")?.forEach(el=>el.classList.remove("hidden"));
    }catch(err){
      alert(err.message);
    }
  });

  forgot?.addEventListener("click", async (e)=>{
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    try{
      if(!auth) throw new Error("Auth not initialized");
      if(!email) return alert("Enter your email first.");
      await auth.sendPasswordResetEmail(email);
      alert("Password reset email sent.");
    }catch(err){ alert(err.message); }
  });

  // reflect auth state in nav
  onAuthChange(user=>{
    if(user){
      dashLink?.classList.remove("hidden");
      document.querySelectorAll(".only-logged-out")?.forEach(el=>el.classList.add("hidden"));
      document.querySelectorAll(".only-logged-in")?.forEach(el=>el.classList.remove("hidden"));
    }else{
      dashLink?.classList.add("hidden");
      document.querySelectorAll(".only-logged-out")?.forEach(el=>el.classList.remove("hidden"));
      document.querySelectorAll(".only-logged-in")?.forEach(el=>el.classList.add("hidden"));
    }
  });

  // logout buttons
  document.querySelectorAll(".logoutBtn").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      try{ await auth?.signOut(); }catch{}
    });
  });
}
