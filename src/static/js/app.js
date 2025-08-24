(function(){
  const grid = document.getElementById('grid');
  const search = document.getElementById('search');
  const filter = document.getElementById('filter');

  // Conta
  const accountBtn   = document.getElementById('accountBtn');
  const accountModal = document.getElementById('accountModal');
  const saveAccount  = document.getElementById('saveAccount');
  const accClose     = document.getElementById('accClose');
  const topAvatar    = document.getElementById('topAvatar');
  const accAvatarPreview = document.getElementById('accAvatarPreview');
  const avatarFile   = document.getElementById('avatarFile');

  // Cropper
  const cropModal  = document.getElementById('cropModal');
  const cropCanvas = document.getElementById('cropCanvas');
  const cropZoom   = document.getElementById('cropZoom');
  const cropOpen   = document.getElementById('cropOpen');
  const cropCancel = document.getElementById('cropCancel');
  const cropSave   = document.getElementById('cropSave');

  // Backup/restore/logout
  const backupBtn = document.getElementById('backupBtn');
  const restoreBtn= document.getElementById('restoreBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // TMDB
  const tmdbQuery = document.getElementById('tmdbQuery');
  const tmdbResults = document.getElementById('tmdbResults');
  const tmdbStudio  = document.getElementById('tmdbStudio');

  // ===== LISTA =====
  async function load(){
    const q = (search.value||'').trim();
    const f = (filter.value||'todos').trim();
    const r = await fetch(`/api/movies?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(f)}`);
    if (r.status === 401) { location.href = '/'; return; }
    const d = await r.json();
    if (!d.ok) { grid.innerHTML = '<p style="padding:12px">Erro ao carregar.</p>'; return; }
    render(d.items||[]);
  }

  function render(items){
    grid.innerHTML = '';
    if (!items.length){ grid.innerHTML = '<p style="padding:12px">Nenhum item.</p>'; return; }
    const tpl = document.getElementById('cardTpl');
    items.forEach(m=>{
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector('.title').textContent = m.title;
      node.querySelector('.meta').textContent = `${m.year || ''} • ${m.studio || ''}`;
      node.querySelector('.tmdb').textContent = m.tmdb_rating!=null ? `TMDB ${Number(m.tmdb_rating).toFixed(1)}` : '';

      // poster via proxy
      const img = node.querySelector('.poster');
      if (m.poster_path){
        const rel = m.poster_path.startsWith('/') ? m.poster_path.substring(1) : m.poster_path;
        img.src = `/img/tmdb/w342/${rel}`;
      } else {
        img.src = '';
      }

      // nota minha / site
      node.querySelector('.mine').textContent = m.my_rating!=null ? m.my_rating : 'x';
      node.querySelector('.site').textContent = m.site_index!=null ? m.site_index : 'x';

      // Assistido
      const watch = node.querySelector('.watchBtn');
      watch.textContent = m.watched ? 'Assistido ✔' : 'Marcar assistido';
      watch.classList.toggle('ok', !!m.watched);
      watch.onclick = async ()=>{
        const r = await fetch(`/api/movies/${m.id}/toggle_watch`, {method:'POST'});
        const d = await r.json();
        if (!d.ok) return alert('Erro');
        load();
      };

      // Estrelas
      const stars = node.querySelectorAll('.star');
      function paint(score){ stars.forEach((s,i)=>{ s.classList.toggle('on', i<score); s.classList.toggle('off', i>=score); }); }
      paint(m.my_rating||0);
      stars.forEach(btn=>{
        btn.disabled = !m.watched;
        btn.onclick = async ()=>{
          const score = Number(btn.dataset.score);
          const r = await fetch(`/api/movies/${m.id}/rate`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({rating:score})});
          const d = await r.json();
          if (!d.ok) return alert(d.error || 'Erro');
          load();
        };
      });

      grid.appendChild(node);
    });
  }

  if (search) search.addEventListener('input', ()=> load());
  if (filter) filter.addEventListener('change', ()=> load());

  // ===== CONTA =====
  if (accountBtn) accountBtn.onclick = ()=>{
    const nameEl = document.querySelector('.user');
    if (nameEl) document.getElementById('accName').value = nameEl.textContent.trim();
    const userEl = document.querySelector('.user');
    document.getElementById('accUser').value = (userEl ? userEl.textContent.trim().toLowerCase().replace(/\s+/g,'') : '');
    if (topAvatar && topAvatar.src){ accAvatarPreview.src = topAvatar.src; accAvatarPreview.style.display=''; }
    accountModal.showModal();
  };
  if (accClose) accClose.onclick = ()=> accountModal.close();

  if (saveAccount) saveAccount.onclick = async ()=>{
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
      alert('Senha alterada. Faça login novamente.');
      location.href = '/';
      return;
    }

    alert('Dados salvos');
    location.reload();
  };

  // ===== AVATAR + CROPPER =====
  let imgObj=null, imgX=150, imgY=150, dragging=false, sx=0, sy=0;
  function drawCrop(){
    const ctx = cropCanvas.getContext('2d');
    const W=cropCanvas.width, H=cropCanvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#222'; ctx.fillRect(0,0,W,H);
    if(!imgObj) return;
    const scale=Number(cropZoom.value);
    const iw=imgObj.width*scale, ih=imgObj.height*scale;
    ctx.drawImage(imgObj, imgX - iw/2, imgY - ih/2, iw, ih);
    ctx.save(); ctx.globalCompositeOperation='destination-in';
    ctx.beginPath(); ctx.arc(W/2,H/2,W/2-4,0,Math.PI*2); ctx.fill(); ctx.restore();
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(W/2,H/2,W/2-4,0,Math.PI*2); ctx.stroke();
  }
  function startDrag(e){ dragging=true; const p=e.touches?e.touches[0]:e; sx=p.clientX; sy=p.clientY; }
  function moveDrag(e){ if(!dragging) return; const p=e.touches?e.touches[0]:e; imgX+=p.clientX-sx; imgY+=p.clientY-sy; sx=p.clientX; sy=p.clientY; drawCrop(); }
  function endDrag(){ dragging=false; }

  if (cropCanvas){
    ['mousedown','touchstart'].forEach(ev=>cropCanvas.addEventListener(ev,startDrag));
    ['mousemove','touchmove'].forEach(ev=>cropCanvas.addEventListener(ev,moveDrag));
    ['mouseup','mouseleave','touchend'].forEach(ev=>cropCanvas.addEventListener(ev,endDrag));
    if (cropZoom) cropZoom.addEventListener('input', drawCrop);
  }

  if (avatarFile) avatarFile.addEventListener('change', ()=>{
    const f = avatarFile.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = e=>{
      imgObj = new Image();
      imgObj.onload = ()=>{ imgX=150; imgY=150; cropZoom.value=1; drawCrop(); accAvatarPreview.src=e.target.result; accAvatarPreview.style.display=''; };
      imgObj.src = e.target.result;
    };
    reader.readAsDataURL(f);
  });

  if (cropOpen) cropOpen.onclick = ()=>{
    if (!accAvatarPreview.src) return alert('Envie uma imagem primeiro.');
    imgObj = new Image();
    imgObj.onload = ()=>{ imgX=150; imgY=150; cropZoom.value=1; drawCrop(); cropModal.showModal(); };
    imgObj.src = accAvatarPreview.src;
  };
  if (cropCancel) cropCancel.onclick = ()=> cropModal.close();
  if (cropSave) cropSave.onclick = async ()=>{
    const dataUrl = cropCanvas.toDataURL('image/png');
    const r = await fetch('/api/account/avatar', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({data_url:dataUrl})});
    const d = await r.json();
    if (!d.ok) return alert('Falha ao salvar avatar');
    cropModal.close();
    if (topAvatar){ topAvatar.src = dataUrl; topAvatar.style.display=''; }
    if (accAvatarPreview){ accAvatarPreview.src = dataUrl; accAvatarPreview.style.display=''; }
    alert('Avatar atualizado!');
  };

  // ===== BACKUP / RESTORE / LOGOUT =====
  if (backupBtn) backupBtn.onclick = ()=> window.open('/api/admin/backup','_blank');
  if (restoreBtn) restoreBtn.onclick = async ()=>{
    const text = prompt('Cole aqui o JSON de backup para restaurar:');
    if (!text) return;
    try{
      const payload = JSON.parse(text);
      const r = await fetch('/api/admin/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d = await r.json();
      if (!d.ok) return alert('Falha ao restaurar');
      alert('Restaurado com sucesso'); load();
    }catch(e){ alert('JSON inválido'); }
  };
  if (logoutBtn) logoutBtn.onclick = async ()=>{ await fetch('/api/auth/logout',{method:'POST'}); location.href='/'; };

  // ===== TMDB AUTOCOMPLETE =====
  let tmdbTimer=null;
  async function doSearchTMDB(q){
    const r = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`);
    if (r.status===401){ location.href='/'; return; }
    const d = await r.json();
    tmdbResults.innerHTML = '';
    if (!d.ok){ tmdbResults.innerHTML='<li class="disabled">TMDB não configurado</li>'; return; }
    d.results.forEach(item=>{
      const li = document.createElement('li');
      const rel = item.poster_path ? (item.poster_path.startsWith('/')? item.poster_path.substring(1):item.poster_path) : '';
      li.innerHTML = `<img src="${rel?('/img/tmdb/w92/'+rel):'/static/img/placeholder.png'}"><span>${item.title} (${item.year||'?'})</span><em>${(item.rating??'') && Number(item.rating).toFixed(1)}</em>`;
      li.onclick = async ()=>{
        const studio = tmdbStudio.value || '';
        const r2 = await fetch('/api/movies/from_tmdb',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tmdb_id:item.id,studio})});
        const d2 = await r2.json();
        if (!d2.ok) return alert(d2.error || 'Erro TMDB');
        tmdbResults.innerHTML=''; tmdbQuery.value=''; load();
      };
      tmdbResults.appendChild(li);
    });
  }
  if (tmdbQuery){
    tmdbQuery.addEventListener('input', ()=>{
      const q = tmdbQuery.value.trim();
      tmdbResults.innerHTML='';
      if(!q) return;
      clearTimeout(tmdbTimer);
      tmdbTimer = setTimeout(()=>doSearchTMDB(q),300);
    });
    document.addEventListener('click',(e)=>{ if(!tmdbQuery.contains(e.target) && !tmdbResults.contains(e.target)) tmdbResults.innerHTML=''; });
  }

  // start
  load();
})();
