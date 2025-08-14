(function(){
  const root = document.documentElement;
  const key = "stn-theme";
  function apply(t){ root.setAttribute("data-theme", t); }
  function current(){ return root.getAttribute("data-theme") || "dark"; }
  const saved = localStorage.getItem(key);
  if(saved) apply(saved); else apply(current());
  document.querySelectorAll(".themeToggle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const t = current()==="dark" ? "light" : "dark";
      apply(t); localStorage.setItem(key, t);
    });
  });
})();
