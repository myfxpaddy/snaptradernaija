(function(){
  const KEY="stn_theme";
  const root = document.documentElement;
  const apply = (t)=> root.setAttribute("data-theme", t);
  apply(localStorage.getItem(KEY) || "dark");
  document.querySelectorAll(".themeToggle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const next = (root.getAttribute("data-theme")==="dark") ? "light" : "dark";
      apply(next); localStorage.setItem(KEY, next);
    });
  });
})();
