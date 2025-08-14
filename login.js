/* global firebase, window */
const app = firebase.initializeApp(window.FIREBASE_CONFIG);
const auth = firebase.auth();

const $ = sel => document.querySelector(sel);
const err = $("#err");
function showErr(m){ err.textContent = m; err.classList.add("show"); }
function clearErr(){ err.textContent=""; err.classList.remove("show"); }

const actionCodeSettings = { url: "https://myfxpaddy.github.io/snaptradernaija/login.html", handleCodeInApp: false };

$("#loginForm").addEventListener("submit", async (e)=>{
  e.preventDefault(); clearErr();
  const email = $("#email").value.trim();
  const pass  = $("#password").value;
  try{
    const { user } = await auth.signInWithEmailAndPassword(email, pass);
    if(!user.emailVerified){
      await user.sendEmailVerification(actionCodeSettings);
      showErr("Please verify your email. We just sent you a verification link.");
      return;
    }
    localStorage.setItem("stn_user", JSON.stringify({ email: user.email, at: Date.now() }));
    window.location.href = "./dashboard.html";
  }catch(ex){
    if (ex && ex.code === "auth/user-not-found") return showErr("No account with this email. Create one on the Sign up page.");
    if (ex && ex.code === "auth/wrong-password") return showErr("Wrong password. Try again or reset your password.");
    showErr(ex.message || "Login failed.");
  }
});

$("#resetBtn").addEventListener("click", async (e)=>{
  e.preventDefault(); clearErr();
  const email = $("#email").value.trim();
  try{
    if(!email) throw new Error("Enter your email above, then click reset.");
    await firebase.auth().sendPasswordResetEmail(email);
    alert("Reset email sent.");
  }catch(ex){ showErr(ex.message || "Could not send reset email."); }
});
