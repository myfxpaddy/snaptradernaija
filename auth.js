/* global firebase, window */
let app=null, auth=null, db=null;

try{
  app  = firebase.initializeApp(window.FIREBASE_CONFIG);
  auth = firebase.auth();
  db   = firebase.firestore();
}catch(e){
  console.warn("Firebase init problem:", e);
}

export function onAuthChange(cb){ return auth?.onAuthStateChanged(cb); }
export async function getIdToken(){ return auth?.currentUser ? auth.currentUser.getIdToken(true) : null; }

function show(el){ el?.classList?.remove("hidden"); }
function hide(el){ el?.classList?.add("hidden"); }

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

  let mode = "signup"; // "signup" | "login"

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
    hide(verifyBlk);
    err.textContent=""; hide(err);
    document.getElementById("authEmail").value = "";
    document.getElementById("authPass").value  = "";
  }

  function open(){ document.getElementById("authModal")?.showModal(); }
  function close(){ document.getElementById("authModal")?.close(); }

  loginBtn?.addEventListener("click", ()=>{ setMode("login"); open(); });
  signupBtn?.addEventListener("click", ()=>{ setMode("signup"); open(); });
  cancelBtn?.addEventListener("click",(e)=>{ e.preventDefault(); close(); });

  switchMode?.addEventListener("click",(e)=>{ e.preventDefault(); setMode(mode==="signup"?"login":"signup"); });

  forgot?.addEventListener("click", async (e)=>{
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
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

    const email = document.getElementById("authEmail").value.trim();
    const pass  = document.getElementById("authPass").value.trim();

    try{
      if(mode==="signup"){
        const fullName = document.getElementById("fullName").value.trim();
        const country  = document.getElementById("country").value.trim();
        const agree    = document.getElementById("agree").checked;
        if(!fullName) throw new Error("Please enter your full name.");
        if(!agree)    throw new Error("You must agree to Terms & Privacy.");

        const cred = await auth.createUserWithEmailAndPassword(email, pass);

        // Save profile in Firestore
        const uid = cred.user.uid;
        await db.collection("users").doc(uid).set({ createdAt: Date.now() }, { merge:true });
        await db.collection("users").doc(uid).collection("profile").doc("main")
          .set({ fullName, country, email, createdAt: Date.now() });

        // Send verification & show verify block
        await cred.user.sendEmailVerification();
        show(verifyBlk);

      }else{
        const { user } = await auth.signInWithEmailAndPassword(email, pass);
        if(!user.emailVerified){
          show(verifyBlk);
          throw new Error("Please verify your email. We’ve sent you a link.");
        }
        // set simple UI flag for gating on homepage
        localStorage.setItem("stn_user", JSON.stringify({ email: user.email, at: Date.now() }));
        close();
      }
    }catch(ex){
      err.textContent = "Firebase: " + (ex.message || "Auth error");
      show(err);
    }
  });

  // reflect auth state for nav visibility
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

  // logout buttons
  document.querySelectorAll(".logoutBtn").forEach(btn=>{
    btn.addEventListener("click", async ()=>{ try{ await auth?.signOut(); }catch{} });
  });
}
