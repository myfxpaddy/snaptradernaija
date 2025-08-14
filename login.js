/* global firebase, window */
const app = firebase.initializeApp(window.FIREBASE_CONFIG);
const auth = firebase.auth();

const $ = sel => document.querySelector(sel);
const err = $("#err");
function showErr(m){ err.textContent = m; err.classList.add("show"); }
function clearErr(){ err.textContent=""; err.classList.remove("show"); }

$("#loginForm").addEventListener("submit", async (e)=>{
  e.preventDefault(); clearErr();
  const email = $("#email").value.trim();
  const pass  = $("#password").value;
  try{
    const { user } = await auth.signInWithEmailAndPassword(email, pass);
    if(!user.emailVerified){ showErr("Please verify your email first."); return; }
    localStorage.setItem("stn_user", JSON.stringify({ email: user.email, at: Date.now() }));
    window.location.href = "./dashboard.html";
  }catch(ex){ showErr(ex.message || "Login failed."); }
});

$("#resetBtn").addEventListener("click", async (e)=>{
  e.preventDefault(); clearErr();
  const email = $("#email").value.trim();
  try{
    if(!email) throw new Error("Enter your email in the box above, then click reset.");
    await firebase.auth().sendPasswordResetEmail(email);
    alert("Reset email sent.");
  }catch(ex){ showErr(ex.message || "Could not send reset email."); }
});
