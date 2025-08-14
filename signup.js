/* global firebase, window */
const app = firebase.initializeApp(window.FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.firestore();

const $ = sel => document.querySelector(sel);
const err = $("#err");
function showErr(m){ err.textContent = m; err.classList.add("show"); }
function clearErr(){ err.textContent=""; err.classList.remove("show"); }

const actionCodeSettings = {
  url: "https://myfxpaddy.github.io/snaptradernaija/login.html",
  handleCodeInApp: false, // open in browser, not inside app
  // iOS/Android not used here, web only
};

$("#signupForm").addEventListener("submit", async (e)=>{
  e.preventDefault(); clearErr();

  const profile = {
    fullName: $("#fullName").value.trim(),
    country:  $("#country").value.trim(),
    phone:    $("#phone").value.trim(),
    gender:   $("#gender").value,
    address:  $("#address").value.trim(),
    telegram: $("#telegram").value.trim(),
    isAdult:  $("#isAdult").checked,
    agreed:   $("#agree").checked,
    email:    $("#email").value.trim(),
    createdAt: Date.now()
  };
  const pass = $("#password").value;

  try{
    if(!profile.fullName) throw new Error("Please enter your full name.");
    if(!profile.country)  throw new Error("Please enter your country.");
    if(!profile.isAdult)  throw new Error("Please confirm you are 18+.");
    if(!profile.agreed)   throw new Error("You must accept Terms & Privacy.");
    if(!profile.email)    throw new Error("Email is required.");
    if(!pass || pass.length<6) throw new Error("Password must be at least 6 characters.");

    const cred = await auth.createUserWithEmailAndPassword(profile.email, pass);
    const uid = cred.user.uid;

    await db.collection("users").doc(uid).set({ createdAt: Date.now() }, { merge:true });
    await db.collection("users").doc(uid).collection("profile").doc("main").set(profile);

    // Send verification email with explicit return URL
    await cred.user.sendEmailVerification(actionCodeSettings);

    const v = document.getElementById("verifyBlock");
    if (v) v.style.display = "block";
    alert("Verification email sent. Please check your inbox (and spam). After verifying, click ‘I’ve verified — refresh’.");

  }catch(ex){
    // If the account already exists, guide the user
    if (ex && ex.code === "auth/email-already-in-use") {
      showErr("This email is already registered. Try logging in — or reset your password if needed.");
      return;
    }
    showErr(ex.message || "Signup failed.");
  }
});

document.getElementById("resendVerifyBtn").addEventListener("click", async ()=>{
  try{
    await firebase.auth().currentUser?.sendEmailVerification({
      url: "https://myfxpaddy.github.io/snaptradernaija/login.html",
      handleCodeInApp: false
    });
    alert("Verification email sent again.");
  }catch(ex){ showErr(ex.message || "Could not resend."); }
});

document.getElementById("checkVerifiedBtn").addEventListener("click", async ()=>{
  try{
    await firebase.auth().currentUser?.reload();
    if(firebase.auth().currentUser?.emailVerified){
      localStorage.setItem("stn_user", JSON.stringify({ email: firebase.auth().currentUser.email, at: Date.now() }));
      window.location.href = "./dashboard.html";
    }else{
      alert("Not verified yet — check your inbox.");
    }
  }catch(ex){ showErr(ex.message || "Could not refresh."); }
});
