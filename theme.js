(function(){
  const root = document.documentElement;
  const KEY = 'stn-theme';
  const saved = localStorage.getItem(KEY);
  if(saved){ root.setAttribute('data-theme', saved); }
  document.querySelectorAll('.themeToggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const cur = root.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem(KEY, next);
    });
  });
})();
