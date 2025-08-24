(function(){
  const tabs = document.querySelectorAll('.tab');
  const sections = document.querySelectorAll('[data-section]');
  const filterChips = document.querySelectorAll('.chip');
  const search = document.getElementById('search');
  const grid = document.getElementById('moviesGrid');
  const modal = document.getElementById('movieModal');
  const modalContent = document.getElementById('modalContent');
  const modalTitle = document.getElementById('modalTitle');
  const addModal = document.getElementById('addModal');
  const addBtn = document.getElementById('addBtn');
  const randomBtn = document.getElementById('randomBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const backupBtn = document.getElementById('backupBtn');
  const restoreFile = document.getElementById('restoreFile');

  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.dataset.tab;
    sections.forEach(s => s.classList.toggle('hidden', s.dataset.section !== tab));
    if (tab === 'admin') renderStats();
  }));

  filterChips.forEach(c => c.addEventListener('click', () => {
    filterChips.forEach(x=>x.classList.remove('active'));
    c.classList.add('active');
    render();
  }));

  if (search) search.addEventListener('input', render);

  addBtn.addEventListener('click', () => addModal.showModal());
  document.getElementById('saveMovie').addEventListener('click', async (e) => {
    e.preventDefault();
    const fd = new FormData(document.getElementById('addForm'));
    const payload = {
      title: fd.get('title').trim(),
      year: parseInt(fd.get('year'),10),
      studio: fd.get('studio'),
      tmdbId: parseInt(fd.get('tmdbId')||'0',10) || null
    };
    const r = await fetch('/api/movies', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const data = await r.json();
    if (!data.ok) return alert('Falha ao adicionar');
    addModal.close();
    render();
  });

  randomBtn.addEventListener('click', async () => {
    const list = window._movies || [];
    if (!list.length) return alert('Nenhum filme');
    const pick = list[Math.floor(Math.random()*list.length)];
    openMovie(pick);
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method:'POST' });
    location.href = '/';
  });

  backupBtn.addEventListener('click', () => {
    window.location.href = '/api/admin/backup';
  });
  restoreFile.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const text = await f.text();
    try{
      const payload = JSON.parse(text);
      const r = await fetch('/api/admin/restore', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const data = await r.json();
      if (!data.ok) throw new Error('Falha no restore');
      alert('Restauração concluída');
      render();
    }catch(err){ alert('Arquivo inválido'); }
  });

  async function fetchMovies(){
    const activeFilter = document.querySelector('.chip.active').dataset.filter;
    const q = (document.getElementById('search').value || '').trim();
    const r = await fetch(`/api/movies?filter=${encodeURIComponent(activeFilter)}&q=${encodeURIComponent(q)}`);
    const data = await r.json();
    window._movies = data.items || [];
  }

  async function render(){
    await fetchMovies();
    grid.innerHTML = '';
    for (const m of window._movies){
      const card = document.createElement('div');
      card.className = 'card movie';

      const img = document.createElement('img');
      img.className = 'thumb'; img.alt = m.title; img.src = '';
      if (m.title.toLowerCase().includes('nemo') && (m.views||0) >= 4) card.classList.add('gold-border');
      posterFor(m.tmdb_id).then(url => {
        img.src = url || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect width=%22300%22 height=%22450%22 fill=%22%23111114%22/><text x=%22150%22 y=%22225%22 text-anchor=%22middle%22 fill=%22%23a1a1aa%22 font-size=%2220%22>Sem pôster</text></svg>';
      });

      const badge = document.createElement('span'); badge.className='badge'; badge.textContent = (m.studio||'').toUpperCase();
      const count = document.createElement('span'); count.className='count'; count.textContent = `👁️ ${m.views||0}`;

      const meta = document.createElement('div'); meta.className='meta';
      meta.innerHTML = `<div class="title">${m.title}</div><small>${m.year||''}</small>`;

      const rating = document.createElement('div'); rating.className='rating';
      const watched = !!m.watched;
      for (let i=1;i<=10;i++){
        const s = document.createElement('span');
        s.textContent = i <= (m.rating||0) ? '★' : '☆';
        s.className = 'star' + (watched ? '' : ' disabled');
        s.dataset.value = i;
        s.addEventListener('click', async () => {
          if (!watched) return;
          const r = await fetch(`/api/movies/${m.id}/rate`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rating:i }) });
          const data = await r.json();
          if (!data.ok) return alert(data.error||'Falha na avaliação');
          render();
        });
        rating.appendChild(s);
      }
      const watchBtn = document.createElement('button');
      watchBtn.className = 'ghost';
      watchBtn.textContent = watched ? 'Marcar como não assistido' : 'Marcar como assistido';
      watchBtn.addEventListener('click', async () => {
        const r = await fetch(`/api/movies/${m.id}/toggle_watch`, { method:'POST' });
        const data = await r.json();
        if (!data.ok) return alert('Falha');
        render();
      });
      meta.appendChild(rating); meta.appendChild(watchBtn);

      card.appendChild(img); card.appendChild(badge); card.appendChild(count); card.appendChild(meta);
      card.addEventListener('click', (ev) => {
        if (ev.target.classList.contains('star') || ev.target === watchBtn) return;
        openMovie(m);
      });
      grid.appendChild(card);
    }
    renderStats();
  }

  function openMovie(m){
    document.getElementById('modalTitle').textContent = m.title;
    document.getElementById('modalContent').innerHTML = `
      <p><strong>Ano:</strong> ${m.year||''}</p>
      <p><strong>Estúdio:</strong> ${(m.studio||'').toUpperCase()}</p>
      <p><strong>Assistido:</strong> ${m.watched ? 'Sim' : 'Não'}</p>
      <p><strong>Visualizações:</strong> ${m.views||0}</p>
      <p><strong>Nota:</strong> ${m.rating ?? '—'}</p>
    `;
    movieModal.showModal();
  }

  async function renderStats(){
    const list = window._movies || [];
    const total = list.length;
    const watched = list.filter(m=>m.watched).length;
    const avg = (list.reduce((acc,m)=>acc+(m.rating||0),0) / Math.max(1,watched)).toFixed(2);
    document.getElementById('statsList').innerHTML = `
      <li>Total de filmes: ${total}</li>
      <li>Assistidos: ${watched}</li>
      <li>Média das notas: ${isNaN(avg)?'—':avg}</li>
      <li>Tempo de carregamento alvo: &lt; 2s</li>
    `;
  }

  async function posterFor(tmdbId){
    if (!tmdbId) return null;
    try{
      const r = await fetch(`/api/tmdb/poster/${tmdbId}`);
      const data = await r.json();
      return data.url || null;
    }catch(e){ return null; }
  }

  render();
})();
