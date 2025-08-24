(function(){

  // elementos
  const grid = document.getElementById('grid');
  const search = document.getElementById('search');
  const filter = document.getElementById('filter');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const addBtn = document.getElementById('addBtn');
  const addModal = document.getElementById('addModal');
  const saveMovie = document.getElementById('saveMovie');
  const logoutBtn = document.getElementById('logoutBtn');
  const backupBtn = document.getElementById('backupBtn');
  const restoreBtn = document.getElementById('restoreBtn');

  const accountBtn = document.getElementById('accountBtn');
  const accountModal = document.getElementById('accountModal');
  const saveAccount = document.getElementById('saveAccount');

  // helpers
  function h(tag, attrs={}, ...children){
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=> el.setAttribute(k,v));
    children.forEach(c => {
      if (c==null) return;
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else el.appendChild(c);
    });
    return el;
  }

  // carregar lista
  async function load(){
    const q = search ? (search.value || '').trim() : '';
    const f = filter ? (filter.value || 'todos') : 'todos';
    const url = `/api/movies?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(f)}`;
    const r = await fetch(url);
    const data = await r.json();
    if (!data.ok) { grid.innerHTML = '<p>Erro ao carregar.</p>'; return; }
    render(data.items);
  }

  function render(items){
    grid.innerHTML = '';
    if (!items.length){
      grid.appendChild(h('p',{},'Nenhum item.'));
      return;
    }
    const tpl = document.getElementById('cardTpl');
    items.forEach(m => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector('.title').textContent = m.title;
      node.querySelector('.meta').textContent = `${m.year || ''} • ${m.studio || ''} ${m.rating?('• Nota '+m.rating):''}`;
      node.querySelector('.views').textContent = (m.views||0);

      // poster (se tiver TMDB)
      const img = node.querySelector('.poster');
      img.src = '/static/img/placeholder.png';
      if (m.tmdb_id){
        fetch(`/api/tmdb/poster/${m.tmdb_id}`).then(x=>x.json()).then(res=>{
          if (res.ok && res.url) img.src = res.url;
        }).catch(()=>{});
      }

      // Assistido / views
      const watchBtn = node.querySelector('.watchBtn');
      watchBtn.textContent = m.watched ? 'Assistido ✔' : 'Marcar assistido';
      watchBtn.addEventListener('click', async ()=>{
        const r = await fetch(`/api/movies/${m.id}/toggle_watch`, {method:'POST'});
        const d = await r.json();
        if (!d.ok) return alert('Erro');
        load();
      });

      // rating (só se já assistiu)
      node.querySelectorAll('.rateBtn').forEach(btn=>{
        btn.disabled = !m.watched;
        btn.addEventListener('click', async ()=>{
          const score = Number(btn.dataset.score);
          const r = await fetch(`/api/movies/${m.id}/rate`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ rating: score })
          });
          const d = await r.json();
          if (!d.ok) return alert(d.error || 'Erro ao avaliar');
          load();
        });
      });

      grid.appendChild(node);
    });
  }

  // busca/ filtro
  if (search) search.addEventListener('input', ()=>{ load(); });
  if (filter) filter.addEventListener('change', ()=>{ load(); });

  // sortear
  if (shuffleBtn) shuffleBtn.addEventListener('click', ()=>{
    const cards = Array.from(grid.querySelectorAll('.card'));
    if (!cards.length) return;
    const idx = Math.floor(Math.random()*cards.length);
    cards[idx].scrollIntoView({behavior:'smooth', block:'center'});
    cards[idx].classList.add('pulse');
    setTimeout(()=>cards[idx].classList.remove('pulse'), 1200);
  });

  // adicionar filme
  if (addBtn) addBtn.addEventListener('click', ()=> addModal.showModal());
  if (saveMovie) saveMovie.addEventListener('click', async (e)=>{
    e.preventDefault();
    const title = document.getElementById('mTitle').value.trim();
    const year = document.getElementById('mYear').value.trim();
    const studio = document.getElementById('mStudio').value;
    const tmdbId = document.getElementById('mTmdb').value.trim();
    const r = await fetch('/api/movies', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title, year, studio, tmdbId })
    });
    const d = await r.json();
    if (!d.ok) return alert('Erro ao salvar');
    addModal.close();
    document.getElementById('mTitle').value = '';
    document.getElementById('mYear').value = '';
    document.getElementById('mTmdb').value = '';
    load();
  });

  // backup
  if (backupBtn) backupBtn.addEventListener('click', ()=>{
    window.open('/api/admin/backup','_blank');
  });

  // restore (pede JSON)
  if (restoreBtn) restoreBtn.addEventListener('click', async ()=>{
    const text = prompt('Cole aqui o JSON do backup para restaurar:');
    if (!text) return;
    try {
      const payload = JSON.parse(text);
      const r = await fetch('/api/admin/restore', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (!d.ok) return alert('Falha ao restaurar');
      alert('Restaurado com sucesso');
      load();
    } catch(e){ alert('JSON inválido'); }
  });

  // conta
  if (accountBtn) accountBtn.addEventListener('click', ()=>{
    // preenche nome atual (renderizado no header) e deixa username para o usuário informar
    const nameEl = document.querySelector('.user');
    if (nameEl) document.getElementById('accName').value = nameEl.textContent.trim();
    accountModal.showModal();
  });

  if (saveAccount) saveAccount.addEventListener('click', async (e)=>{
    e.preventDefault();
    const name = document.getElementById('accName').value.trim();
    const username = document.getElementById('accUser').value.trim();
    const secret_question = document.getElementById('accQ').value.trim();
    const secret_answer = document.getElementById('accA').value.trim();
    const old_password = document.getElementById('oldPass').value.trim();
    const new_password = document.getElementById('newPass').value.trim();

    // 1) perfil
    const r1 = await fetch('/api/account/update_profile', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, username, secret_question, secret_answer })
    });
    const d1 = await r1.json();
    if (!d1.ok) return alert(d1.error || 'Falha ao salvar perfil');

    // 2) senha (opcional)
    if (old_password && new_password){
      const r2 = await fetch('/api/account/change_password', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ old_password, new_password })
      });
      const d2 = await r2.json();
      if (!d2.ok) return alert(d2.error || 'Falha ao trocar senha');
    }

    alert('Dados salvos');
    location.reload();
  });

  // logout
  if (logoutBtn) logoutBtn.addEventListener('click', async ()=>{
    await fetch('/api/auth/logout', {method:'POST'});
    location.href = '/';
  });

  // start
  load();

})();
