/* global firebase, window */
let app=null, auth=null, db=null;

try{
  app  = firebase.initializeApp(window.FIREBASE_CONFIG);
  auth = firebase.auth();
  db   = firebase.firestore();
}catch(e){ console.warn("Firebase init problem:", e); }

export function onAuthChange(cb){ return auth?.onAuthStateChanged(cb); }
export async function getIdToken(){ return auth?.currentUser ? auth.currentUser.getIdToken(true) : null; }

function show(el){ el?.classList?.remove("hidden"); }
function hide(el){ el?.classList?.add("hidden"); }

function val(id){ return (document.getElementById(id)?.value || "").trim(); }
function checked(id){ return !!document.getElementById(id)?.checked; }

export function wireAuthUI(){
  const loginBtn   = document.getElementById("loginOpenBtn");
  const signupBtn  = document.getElementById("signupOpenBtn");
  const cancelBtn  = document.getElementById("authCancelBtn");
  const form       = document.getElementById("authForm");
  const title      = document.getElementById("authTitle");
  const msg        = document.getElementById("authMsg");
  const err        = document.getElementById("authErr");
  const switchMode = document.getElementById("switchMode");
  const forgot     = document.getElementById("forgotLink");
  const verifyBlk  = document.getElementById("verifyBlock");
  const resendBtn  = document.getElementById("resendVerifyBtn");
  const checkBtn   = document.getElementById("checkVerifiedBtn");
  const signupFields = document.getElementById("signupFields");

  let mode = "signup";

  function setMode(m){
    mode = m;
    if(m==="signup"){
      title.textContent = "Sign up";
      msg.textContent = "Create an account to view results and keep your dashboard in sync.";
      switchMode.textContent = "Already have an account? Log in";
      show(signupFields);
    }else{
      title.textContent = "Log in";
      msg.textContent = "Welcome back.";
      switchMode.textContent = "New here? Create account";
      hide(signupFields);
    }
    hide(verifyBlk); err.textContent=""; hide(err);
    const ids = ["authEmail","authPass","fullName","country","phone","gender","address","telegram"];
    ids.forEach(i => { const el = document.getElementById(i); if(el) el.value = ""; });
    ["agree","isAdult"].forEach(i => { const el = document.getElementById(i); if(el) el.checked=false; });
  }

  function open(){ document.getElementById("authModal")?.showModal(); }
  function close(){ document.getElementById("authModal")?.close(); }

  loginBtn?.addEventListener("click", ()=>{ setMode("login"); open(); });
  signupBtn?.addEventListener("click", ()=>{ setMode("signup"); open(); });
  cancelBtn?.addEventListener("click",(e)=>{ e.preventDefault(); close(); });

  switchMode?.addEventListener("click",(e)=>{ e.preventDefault(); setMode(mode==="signup"?"login":"signup"); });

  forgot?.addEventListener("click", async (e)=>{
    e.preventDefault();
    const email = val("authEmail");
    try{
      if(!email) throw new Error("Enter your email first.");
      await auth.sendPasswordResetEmail(email);
      alert("Password reset email sent.");
    }catch(ex){ err.textContent = ex.message; show(err); }
  });

  resendBtn?.addEventListener("click", async ()=>{
    try{ await auth.currentUser?.sendEmailVerification(); alert("Verification email re-sent."); }
    catch(ex){ err.textContent = ex.message; show(err); }
  });

  checkBtn?.addEventListener("click", async ()=>{
    try{
      await auth.currentUser?.reload();
      if(auth.currentUser?.emailVerified){ alert("Verified!"); close(); }
      else alert("Not verified yet. Please check your inbox.");
    }catch(ex){ err.textContent = ex.message; show(err); }
  });

  form?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    hide(err);

    const email = val("authEmail");
    const pass  = val("authPass");

    try{
      if(mode==="signup"){
        const profile = {
          fullName: val("fullName"),
          country:  val("country"),
          phone:    val("phone"),
          gender:   val("gender"),
          address:  val("address"),
          telegram: val("telegram"),
          isAdult:  checked("isAdult"),
          agreed:   checked("agree"),
          email,
          createdAt: Date.now()
        };

        if(!profile.fullName) throw new Error("Please enter your full name.");
        if(!profile.country)  throw new Error("Please enter your country.");
        if(!profile.isAdult)  throw new Error("You must confirm you are 18+.");
        if(!profile.agreed)   throw new Error("You must accept Terms & Privacy.");
        if(!email)            throw new Error("Email is required.");
        if(!pass || pass.length<6) throw new Error("Password must be at least 6 characters.");

        const cred = await auth.createUserWithEmailAndPassword(email, pass);

        const uid = cred.user.uid;
        await db.collection("users").doc(uid).set({ createdAt: Date.now() }, { merge:true });
        await db.collection("users").doc(uid).collection("profile").doc("main").set(profile);

        await cred.user.sendEmailVerification();
        show(verifyBlk);

      }else{
        const { user } = await auth.signInWithEmailAndPassword(email, pass);
        if(!user.emailVerified){
          show(verifyBlk);
          throw new Error("Please verify your email. We’ve sent you a link.");
        }
        localStorage.setItem("stn_user", JSON.stringify({ email: user.email, at: Date.now() }));
        close();
      }
    }catch(ex){
      const msg = (ex && ex.message) ? ex.message : "Auth error";
      document.getElementById("authErr").textContent = msg.startsWith("Firebase:") ? msg : "Firebase: " + msg;
      show(document.getElementById("authErr"));
    }
  });

  onAuthChange(u=>{
    const dashLink = document.getElementById("dashLink");
    if(u && u.emailVerified){
      dashLink?.classList.remove("hidden");
      document.querySelectorAll(".only-logged-out").forEach(el=>el.classList.add("hidden"));
      document.querySelectorAll(".only-logged-in").forEach(el=>el.classList.remove("hidden"));
      localStorage.setItem("stn_user", JSON.stringify({ email: u.email, at: Date.now() }));
    }else{
      dashLink?.classList.add("hidden");
      document.querySelectorAll(".only-logged-out").forEach(el=>el.classList.remove("hidden"));
      document.querySelectorAll(".only-logged-in").forEach(el=>el.classList.add("hidden"));
      localStorage.removeItem("stn_user");
    }
  });

  document.querySelectorAll(".logoutBtn").forEach(btn=>{
    btn.addEventListener("click", async ()=>{ try{ await auth?.signOut(); }catch{} });
  });
}
