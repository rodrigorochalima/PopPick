(function(){
  const grid = document.getElementById('grid');
  const search = document.getElementById('search');
  const filter = document.getElementById('filter');

  // Top bar
  const accountBtn=document.getElementById('accountBtn'), accountModal=document.getElementById('accountModal');
  const saveAccount=document.getElementById('saveAccount'), accClose=document.getElementById('accClose');
  const topAvatar=document.getElementById('topAvatar'), accAvatarPreview=document.getElementById('accAvatarPreview');
  const avatarFile=document.getElementById('avatarFile');
  const cropModal=document.getElementById('cropModal'), cropCanvas=document.getElementById('cropCanvas');
  const cropZoom=document.getElementById('cropZoom'), cropOpen=document.getElementById('cropOpen'), cropCancel=document.getElementById('cropCancel'), cropSave=document.getElementById('cropSave');
  const backupBtn=document.getElementById('backupBtn'), restoreBtn=document.getElementById('restoreBtn'), logoutBtn=document.getElementById('logoutBtn');

  // TMDB add + relink
  const tmdbQuery=document.getElementById('tmdbQuery'), tmdbResults=document.getElementById('tmdbResults'), tmdbStudio=document.getElementById('tmdbStudio');
  const relinkModal=document.getElementById('relinkModal'), relinkQuery=document.getElementById('relinkQuery'), relinkResults=document.getElementById('relinkResults'), relinkCancel=document.getElementById('relinkCancel');

  // Details
  const detailsModal=document.getElementById('detailsModal'), dTitle=document.getElementById('dTitle'), dPoster=document.getElementById('dPoster'), dInfo=document.getElementById('dInfo'), dOverview=document.getElementById('dOverview'), dClose=document.getElementById('dClose');

  // Watch modal
  const watchModal=document.getElementById('watchModal'), watchWhen=document.getElementById('watchWhen'), watchCancel=document.getElementById('watchCancel'), watchSave=document.getElementById('watchSave');
  let currentWatchMovieId=null;

  // ===== LISTA =====
  async function load(){
    const q=(search.value||'').trim(), f=(filter.value||'todos').trim();
    const r=await fetch(`/api/movies?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(f)}`);
    if(r.status===401){location.href='/';return;}
    const d=await r.json();
    if(!d.ok){ grid.innerHTML='<p style="padding:12px">Erro ao carregar.</p>'; return; }
    render(d.items||[]);
  }

  function render(items){
    grid.innerHTML='';
    if(!items.length){ grid.innerHTML='<p style="padding:12px">Nenhum item.</p>'; return; }
    const tpl=document.getElementById('cardTpl');

    items.forEach(m=>{
      const node=tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id=m.id;
      node.querySelector('.title').textContent=m.title;
      node.querySelector('.meta').textContent=`${m.year||''} • ${m.studio||''}`;
      node.querySelector('.tmdb').textContent=(m.tmdb_rating!=null)?`TMDB ${Number(m.tmdb_rating).toFixed(1)}`:'';
      node.querySelector('.watched-mini').textContent = m.watch_count? `• ${m.watch_count}x (últ: ${m.last_watched||'-'})` : '';

      const img=node.querySelector('.poster');
      if(m.poster_path){
        const rel=m.poster_path.startsWith('/')? m.poster_path.slice(1):m.poster_path;
        img.src=`/img/tmdb/w342/${rel}`;
      } else img.src='';

      // abrir detalhes ao tocar no poster ou título
      function openDetails(){ showDetails(m); }
      img.onclick=openDetails; node.querySelector('.title').onclick=openDetails;

      // Corrigir ligação TMDB
      node.querySelector('.editTmdb').onclick=()=> openRelink(m.id);

      // Assistido (abre modal com data)
      const watchBtn=node.querySelector('.watchBtn');
      watchBtn.onclick=()=>{ currentWatchMovieId=m.id; watchWhen.value=(new Date()).toISOString().slice(0,16); watchModal.showModal(); };

      // Estrelas
      const stars=node.querySelectorAll('.star');
      function paint(score){ stars.forEach((s,i)=>{ s.classList.toggle('on',i<score); s.classList.toggle('off',i>=score); }); }
      paint(m.my_rating||0);
      stars.forEach(btn=>{
        btn.disabled = !m.watch_count; // só avalia se já assistiu pelo menos 1x
        btn.onclick=async()=>{
          const score=Number(btn.dataset.score);
          const r=await fetch(`/api/movies/${m.id}/rate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:score})});
          const d=await r.json(); if(!d.ok) return alert(d.error||'Erro'); load();
        };
      });

      grid.appendChild(node);
    });
  }

  if(search) search.addEventListener('input',()=>load());
  if(filter) filter.addEventListener('change',()=>load());

  // ===== Detalhes =====
  async function showDetails(m){
    dTitle.textContent=m.title;
    if(m.poster_path){ const rel=m.poster_path.startsWith('/')? m.poster_path.slice(1):m.poster_path; dPoster.src=`/img/tmdb/w342/${rel}`; }
    dInfo.textContent=`${m.year||''} • ${m.studio||''} • TMDB ${m.tmdb_rating!=null?Number(m.tmdb_rating).toFixed(1):'?'}`;
    dOverview.textContent='Carregando…';
    const r=await fetch(`/api/tmdb/details?tmdb_id=${encodeURIComponent(m.tmdb_id)}`);
    const d=await r.json(); dOverview.textContent=d.ok?(d.data.overview_ptbr||d.data.overview||''):('Sem sinopse.');
    detailsModal.showModal();
  }
  if(dClose) dClose.onclick=()=>detailsModal.close();

  // ===== Marcar assistido =====
  if(watchCancel) watchCancel.onclick=()=>watchModal.close();
  if(watchSave) watchSave.onclick=async ()=>{
    if(!currentWatchMovieId) return watchModal.close();
    const when=watchWhen.value? new Date(watchWhen.value).toISOString(): new Date().toISOString();
    const r=await fetch(`/api/movies/${currentWatchMovieId}/watch`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({when})});
    const d=await r.json(); if(!d.ok) return alert(d.error||'Erro');
    watchModal.close(); load();
  };

  // ===== Relink TMDB =====
  let relinkMovieId=null, relinkTimer=null;
  function openRelink(id){ relinkMovieId=id; relinkQuery.value=''; relinkResults.innerHTML=''; relinkModal.showModal(); }
  if(relinkCancel) relinkCancel.onclick=()=>relinkModal.close();
  async function doRelinkSearch(q){
    const r=await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`); const d=await r.json();
    relinkResults.innerHTML=''; if(!d.ok) return;
    d.results.forEach(item=>{
      const li=document.createElement('li');
      const rel=item.poster_path? (item.poster_path.startsWith('/')? item.poster_path.slice(1):item.poster_path):'';
      li.innerHTML=`<img src="${rel?('/img/tmdb/w92/'+rel):'/static/img/placeholder.png'}"><span>${item.title} (${item.year||'?'})</span><em>${(item.rating??'') && Number(item.rating).toFixed(1)}</em>`;
      li.onclick=async()=>{
        const r2=await fetch('/api/movies/relink',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({movie_id:relinkMovieId,tmdb_id:item.id})});
        const d2=await r2.json(); if(!d2.ok) return alert(d2.error||'Erro'); relinkModal.close(); load();
      };
      relinkResults.appendChild(li);
    });
  }
  if(relinkQuery){
    relinkQuery.addEventListener('input',()=>{ const q=relinkQuery.value.trim(); clearTimeout(relinkTimer); if(!q){relinkResults.innerHTML='';return;} relinkTimer=setTimeout(()=>doRelinkSearch(q),300); });
  }

  // ===== Conta / avatar =====
  if(accountBtn) accountBtn.onclick=()=>{
    const nameEl=document.querySelector('.user'); document.getElementById('accName').value=nameEl?nameEl.textContent.trim():''; 
    document.getElementById('accUser').value=(nameEl?nameEl.textContent.trim().toLowerCase().replace(/\s+/g,''):'');
    if(topAvatar&&topAvatar.src){accAvatarPreview.src=topAvatar.src;accAvatarPreview.style.display='';}
    accountModal.showModal();
  };
  if(accClose) accClose.onclick=()=>accountModal.close();
  if(saveAccount) saveAccount.onclick=async ()=>{
    const name=document.getElementById('accName').value.trim();
    const username=document.getElementById('accUser').value.trim();
    const secret_question=document.getElementById('accQ').value.trim();
    const secret_answer=document.getElementById('accA').value.trim();
    const old_password=document.getElementById('oldPass').value.trim();
    const new_password=document.getElementById('newPass').value.trim();

    const r1=await fetch('/api/account/update_profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,username,secret_question,secret_answer})});
    const d1=await r1.json(); if(!d1.ok) return alert(d1.error||'Falha ao salvar perfil');

    if(old_password&&new_password){
      const r2=await fetch('/api/account/change_password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({old_password,new_password})});
      const d2=await r2.json(); if(!d2.ok) return alert(d2.error||'Falha ao trocar senha');
      alert('Senha alterada. Faça login novamente.'); location.href='/'; return;
    }
    alert('Dados salvos'); location.reload();
  };

  // ===== Cropper simples =====
  let imgObj=null,imgX=150,imgY=150,drag=false,sx=0,sy=0;
  function drawCrop(){const ctx=cropCanvas.getContext('2d'),W=cropCanvas.width,H=cropCanvas.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#222';ctx.fillRect(0,0,W,H);if(!imgObj)return;const sc=Number(cropZoom.value);const iw=imgObj.width*sc,ih=imgObj.height*sc;ctx.drawImage(imgObj,imgX-iw/2,imgY-ih/2,iw,ih);ctx.save();ctx.globalCompositeOperation='destination-in';ctx.beginPath();ctx.arc(W/2,H/2,W/2-4,0,Math.PI*2);ctx.fill();ctx.restore();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(W/2,H/2,W/2-4,0,Math.PI*2);ctx.stroke();}
  function start(e){drag=true;const p=e.touches?e.touches[0]:e;sx=p.clientX;sy=p.clientY;} function move(e){if(!drag)return;const p=e.touches?e.touches[0]:e;imgX+=p.clientX-sx;imgY+=p.clientY-sy;sx=p.clientX;sy=p.clientY;drawCrop();} function end(){drag=false;}
  if(cropCanvas){['mousedown','touchstart'].forEach(ev=>cropCanvas.addEventListener(ev,start));['mousemove','touchmove'].forEach(ev=>cropCanvas.addEventListener(ev,move));['mouseup','mouseleave','touchend'].forEach(ev=>cropCanvas.addEventListener(ev,end)); if(cropZoom) cropZoom.addEventListener('input',drawCrop);}
  if(avatarFile) avatarFile.addEventListener('change',()=>{const f=avatarFile.files[0]; if(!f)return; const rd=new FileReader(); rd.onload=e=>{imgObj=new Image(); imgObj.onload=()=>{imgX=150;imgY=150;cropZoom.value=1;drawCrop();accAvatarPreview.src=e.target.result;accAvatarPreview.style.display='';}; imgObj.src=e.target.result;}; rd.readAsDataURL(f);});
  if(cropOpen) cropOpen.onclick=()=>{ if(!accAvatarPreview.src) return alert('Envie uma imagem primeiro.'); imgObj=new Image(); imgObj.onload=()=>{imgX=150;imgY=150;cropZoom.value=1;drawCrop();cropModal.showModal();}; imgObj.src=accAvatarPreview.src; };
  if(cropCancel) cropCancel.onclick=()=>cropModal.close();
  if(cropSave) cropSave.onclick=async ()=>{ const dataUrl=cropCanvas.toDataURL('image/png'); const r=await fetch('/api/account/avatar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data_url:dataUrl})}); const d=await r.json(); if(!d.ok) return alert('Falha ao salvar avatar'); cropModal.close(); if(topAvatar){topAvatar.src=dataUrl;topAvatar.style.display='';} if(accAvatarPreview){accAvatarPreview.src=dataUrl;accAvatarPreview.style.display='';} alert('Avatar atualizado!'); };

  // Backup/Restore/Logout
  if(backupBtn) backupBtn.onclick=()=>window.open('/api/admin/backup','_blank');
  if(restoreBtn) restoreBtn.onclick=async()=>{ const text=prompt('Cole aqui o JSON de backup para restaurar:'); if(!text)return; try{const payload=JSON.parse(text); const r=await fetch('/api/admin/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const d=await r.json(); if(!d.ok) return alert('Falha ao restaurar'); alert('Restaurado com sucesso'); load();}catch(e){alert('JSON inválido');}};
  if(logoutBtn) logoutBtn.onclick=async()=>{ await fetch('/api/auth/logout',{method:'POST'}); location.href='/'; };

  // TMDB adicionar
  let tmdbTimer=null;
  async function doSearchTMDB(q){
    const r=await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`); const d=await r.json();
    tmdbResults.innerHTML=''; if(!d.ok){ tmdbResults.innerHTML='<li class="disabled">TMDB não configurado</li>'; return; }
    d.results.forEach(item=>{
      const li=document.createElement('li');
      const rel=item.poster_path? (item.poster_path.startsWith('/')? item.poster_path.slice(1):item.poster_path):'';
      li.innerHTML=`<img src="${rel?('/img/tmdb/w92/'+rel):'/static/img/placeholder.png'}"><span>${item.title} (${item.year||'?'})</span><em>${(item.rating??'') && Number(item.rating).toFixed(1)}</em>`;
      li.onclick=async()=>{ const studio=tmdbStudio.value||''; const r2=await fetch('/api/movies/from_tmdb',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tmdb_id:item.id,studio})}); const d2=await r2.json(); if(!d2.ok) return alert(d2.error||'Erro TMDB'); tmdbResults.innerHTML=''; tmdbQuery.value=''; load(); };
      tmdbResults.appendChild(li);
    });
  }
  if(tmdbQuery){ tmdbQuery.addEventListener('input',()=>{ const q=tmdbQuery.value.trim(); tmdbResults.innerHTML=''; if(!q) return; clearTimeout(tmdbTimer); tmdbTimer=setTimeout(()=>doSearchTMDB(q),300); }); document.addEventListener('click',(e)=>{ if(!tmdbQuery.contains(e.target)&&!tmdbResults.contains(e.target)) tmdbResults.innerHTML=''; }); }

  // start
  load();
})();
