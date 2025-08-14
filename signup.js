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
  handleCodeInApp: false
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

    // Write ONLY to the allowed path: users/{uid}/profile/main
    await db.collection("users").doc(uid).collection("profile").doc("main").set(profile);

    // Send verification email + redirect to verify page
    await cred.user.sendEmailVerification(actionCodeSettings);
    window.location.href = "./verify.html?email=" + encodeURIComponent(profile.email);

  }catch(ex){
    if (ex && ex.code === "auth/email-already-in-use") {
      // If user already exists, help them move forward
      window.location.href = "./login.html?msg=already";
      return;
    }
    showErr(ex.message || "Signup failed.");
  }
});
