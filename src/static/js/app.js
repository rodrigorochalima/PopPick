(function(){
  const grid = document.getElementById('grid');
  const search = document.getElementById('search');
  const filter = document.getElementById('filter');

  // Conta
  const accountBtn = document.getElementById('accountBtn');
  const accountModal = document.getElementById('accountModal');
  const saveAccount = document.getElementById('saveAccount');
  const topAvatar = document.getElementById('topAvatar');
  const accAvatarPreview = document.getElementById('accAvatarPreview');
  const avatarFile = document.getElementById('avatarFile');

  // Recorte
  const cropModal = document.getElementById('cropModal');
  const cropCanvas = document.getElementById('cropCanvas');
  const cropZoom = document.getElementById('cropZoom');
  const cropOpen = document.getElementById('cropOpen');
  const cropCancel = document.getElementById('cropCancel');
  const cropSave = document.getElementById('cropSave');

  // Backup/restore/logout
  const backupBtn = document.getElementById('backupBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // TMDB autocomplete
  const tmdbQuery = document.getElementById('tmdbQuery');
  const tmdbResults = document.getElementById('tmdbResults');
  const tmdbStudio = document.getElementById('tmdbStudio');

  // ======== LISTA ========
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
    if (!items.length){ grid.innerHTML = '<p>Nenhum item.</p>'; return; }
    const tpl = document.getElementById('cardTpl');
    items.forEach(m => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector('.title').textContent = m.title;
      node.querySelector('.meta').textContent = `${m.year || ''} • ${m.studio || ''}`;
      node.querySelector('.tmdb').textContent = (m.tmdb_rating!=null? `TMDB ${Number(m.tmdb_rating).toFixed(1)}` : '');
      node.querySelector('.mine').textContent = m.my_rating!=null ? m.my_rating : 'x';
      node.querySelector('.site').textContent = m.site_index!=null ? m.site_index : 'x';

      const img = node.querySelector('.poster');
      img.src = m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : '/static/img/placeholder.png';

      // Assistido
      const watchBtn = node.querySelector('.watchBtn');
      watchBtn.textContent = m.watched ? 'Assistido ✔' : 'Marcar assistido';
      watchBtn.addEventListener('click', async ()=>{
        const r = await fetch(`/api/movies/${m.id}/toggle_watch`, {method:'POST'});
        const d = await r.json();
        if (!d.ok) return alert('Erro');
        load();
      });

      // Estrelas
      const stars = node.querySelectorAll('.star');
      function paint(score){
        stars.forEach((s,i)=>{
          s.classList.toggle('on', i < score);
          s.classList.toggle('off', i >= score);
        });
      }
      paint(m.my_rating||0);
      stars.forEach(btn=>{
        btn.disabled = !m.watched; // só se assistiu
        btn.addEventListener('click', async ()=>{
          const score = Number(btn.dataset.score);
          const r = await fetch(`/api/movies/${m.id}/rate`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ rating: score })
          });
          const d = await r.json();
          if (!d.ok) return alert(d.error || 'Erro');
          load();
        });
      });

      grid.appendChild(node);
    });
  }

  if (search) search.addEventListener('input', ()=> load());
  if (filter) filter.addEventListener('change', ()=> load());

  // ======== CONTA ========
  if (accountBtn) accountBtn.addEventListener('click', ()=>{
    // Prefill de nome (pego do header) e avatar atual
    const nameEl = document.querySelector('.user');
    if (nameEl) document.getElementById('accName').value = nameEl.textContent.trim();
    // username o usuário preenche manualmente (não renderizamos no HTML)
    if (topAvatar && topAvatar.src) accAvatarPreview.src = topAvatar.src;
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

    const r1 = await fetch('/api/account/update_profile', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, username, secret_question, secret_answer })
    });
    const d1 = await r1.json();
    if (!d1.ok) return alert(d1.error || 'Falha ao salvar perfil');

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

  // ======== AVATAR (upload + recorte simples) ========
  let imgObj = null, imgX = 150, imgY = 150, dragging = false, startX=0, startY=0;

  function drawCrop(){
    const ctx = cropCanvas.getContext('2d');
    const W = cropCanvas.width, H = cropCanvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#222'; ctx.fillRect(0,0,W,H);
    if (!imgObj) return;
    const scale = Number(cropZoom.value);
    const iw = imgObj.width*scale, ih = imgObj.height*scale;
    ctx.drawImage(imgObj, imgX - iw/2, imgY - ih/2, iw, ih);
    // máscara circular
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath(); ctx.arc(W/2, H/2, W/2-4, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    // borda
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W/2, H/2, W/2-4, 0, Math.PI*2); ctx.stroke();
  }

  function startDrag(e){
    dragging = true;
    const p = e.touches ? e.touches[0] : e;
    startX = p.clientX; startY = p.clientY;
  }
  function moveDrag(e){
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    imgX += (p.clientX - startX);
    imgY += (p.clientY - startY);
    startX = p.clientX; startY = p.clientY;
    drawCrop();
  }
  function endDrag(){ dragging = false; }

  if (cropCanvas){
    ['mousedown','touchstart'].forEach(ev=>cropCanvas.addEventListener(ev, startDrag));
    ['mousemove','touchmove'].forEach(ev=>cropCanvas.addEventListener(ev, moveDrag));
    ['mouseup','mouseleave','touchend'].forEach(ev=>cropCanvas.addEventListener(ev, endDrag));
    if (cropZoom) cropZoom.addEventListener('input', drawCrop);
  }

  if (avatarFile) avatarFile.addEventListener('change', ()=>{
    const f = avatarFile.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = e=>{
      imgObj = new Image();
      imgObj.onload = ()=>{ imgX=150; imgY=150; cropZoom.value=1; drawCrop(); accAvatarPreview.src = e.target.result; };
      imgObj.src = e.target.result;
    };
    reader.readAsDataURL(f);
  });

  if (cropOpen) cropOpen.addEventListener('click', ()=>{
    if (!accAvatarPreview.src) return alert('Envie uma imagem primeiro.');
    imgObj = new Image();
    imgObj.onload = ()=>{ imgX=150; imgY=150; cropZoom.value=1; drawCrop(); cropModal.showModal(); };
    imgObj.src = accAvatarPreview.src;
  });

  if (cropCancel) cropCancel.addEventListener('click', ()=> cropModal.close());
  if (cropSave) cropSave.addEventListener('click', async ()=>{
    // recorta o círculo em PNG
    const dataUrl = cropCanvas.toDataURL('image/png');
    const r = await fetch('/api/account/avatar', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ data_url: dataUrl })
    });
    const d = await r.json();
    if (!d.ok) return alert('Falha ao salvar avatar');
    cropModal.close();
    if (topAvatar){ topAvatar.src = dataUrl; topAvatar.style.display=''; }
    if (accAvatarPreview){ accAvatarPreview.src = dataUrl; }
    alert('Avatar atualizado!');
  });

  // ======== TMDB autocomplete ========
  let tmdbTimer = null;
  async function doSearchTMDB(q){
    const r = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`);
    const data = await r.json();
    tmdbResults.innerHTML = '';
    if (!data.ok) {
      tmdbResults.innerHTML = '<li class="disabled">TMDB não configurado</li>';
      return;
    }
    data.results.forEach(item=>{
      const li = document.createElement('li');
      li.innerHTML = `<img src="${item.poster_path ? 'https://image.tmdb.org/t/p/w92'+item.poster_path : '/static/img/placeholder.png'}"><span>${item.title} (${item.year||'?'})</span><em>${(item.rating??'') && Number(item.rating).toFixed(1)}</em>`;
      li.addEventListener('click', async ()=>{
        const studio = tmdbStudio.value || '';
        const r2 = await fetch('/api/movies/from_tmdb', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ tmdb_id: item.id, studio })
        });
        const d2 = await r2.json();
        if (!d2.ok) return alert(d2.error || 'Erro TMDB');
        tmdbResults.innerHTML = '';
        tmdbQuery.value = '';
        load();
      });
      tmdbResults.appendChild(li);
    });
  }
  if (tmdbQuery){
    tmdbQuery.addEventListener('input', ()=>{
      const q = tmdbQuery.value.trim();
      tmdbResults.innerHTML = '';
      if (!q) return;
      clearTimeout(tmdbTimer);
      tmdbTimer = setTimeout(()=> doSearchTMDB(q), 300);
    });
    document.addEventListener('click', (e)=>{
      if (!tmdbQuery.contains(e.target) && !tmdbResults.contains(e.target)) tmdbResults.innerHTML = '';
    });
  }

  // ======== BACKUP/RESTORE/LOGOUT ========
  if (backupBtn) backupBtn.addEventListener('click', ()=> window.open('/api/admin/backup','_blank'));
  if (restoreBtn) restoreBtn.addEventListener('click', async ()=>{
    const text = prompt('Cole aqui o JSON do backup para restaurar:');
    if (!text) return;
    try{
      const payload = JSON.parse(text);
      const r = await fetch('/api/admin/restore', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
      const d = await r.json();
      if (!d.ok) return alert('Falha ao restaurar');
      alert('Restaurado com sucesso'); load();
    }catch(e){ alert('JSON inválido'); }
  });
  if (logoutBtn) logoutBtn.addEventListener('click', async ()=>{
    await fetch('/api/auth/logout', {method:'POST'});
    location.href = '/';
  });

  // ======== START ========
  load();
})();
