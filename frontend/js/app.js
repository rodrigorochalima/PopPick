import { $, $$, starsHTML, badgeScore } from './utils.js';
import { init, watchAdd, watchAll } from './db.js';
import { tmdbDetailsById, posterUrl, fetchImdbScore } from './tmdb.js';
import { computePoppicAverage } from './poppic.js';

let WATCH_TARGET=null;

async function ensureSeedContent(){
  const ids=[85,671,601,338970]; // Indiana Jones, Harry Potter, ET, Animais Fantásticos
  const details = (await Promise.all(ids.map(id=>tmdbDetailsById(id).catch(()=>null)))).filter(Boolean);
  return details.map(d=>({
    id: 'tmdb-'+d.id, tmdbId:d.id, title:d.title||d.name, poster:d.poster_path,
    synopsis:d.overview, universe: pickUniverse(d),
    imdbId:(d.external_ids && d.external_ids.imdb_id) || null,
    tmdbScore: d.vote_average ? +(d.vote_average).toFixed(1) : null
  }));
}
function pickUniverse(d){ const t=(d.title||d.name||'').toLowerCase(); if(t.includes('harry')||t.includes('indiana')||t.includes('et')) return 'universal'; return 'disney'; }

function renderCard(container,item,poppic,imdbScore,userScore){
  const tpl=$('#card-tpl').content.cloneNode(true);
  const el=tpl.querySelector('.card'); el.dataset.id=item.id;
  const poster=tpl.querySelector('.poster'); poster.src = posterUrl(item.poster);
  tpl.querySelector('.title').textContent=item.title;
  tpl.querySelector('.synopsis').textContent=(item.synopsis||'').slice(0,140)+'…';
  badgeScore(tpl.querySelector('.score-tmdb'), item.tmdbScore);
  badgeScore(tpl.querySelector('.score-imdb'), imdbScore);
  badgeScore(tpl.querySelector('.score-poppic'), poppic);

  const stars = tpl.querySelector('.stars'); stars.innerHTML = starsHTML(userScore||0,10);
  stars.addEventListener('click', async ev=>{
    const b=ev.target.closest('.star'); if(!b) return;
    const v=+b.dataset.v; await registerScore(item,v);
    $$('.star',stars).forEach((s,i)=>s.className='star '+((i+1)<=v?'on':'off'));
  });

  tpl.querySelector('.assistir').addEventListener('click', ()=>{
    document.getElementById('watch-dialog').showModal();
    WATCH_TARGET=item;
    document.getElementById('watch-date').valueAsDate = new Date();
  });

  container.appendChild(tpl);
}
async function registerScore(item,score){ const userId='rodrigo'; await watchAdd({userId,contentId:item.id,date:new Date().toISOString(),score}); }

async function render(){
  await init();
  const container=document.getElementById('content'); container.innerHTML='';
  const items=await ensureSeedContent();
  const events=await watchAll();

  for(const item of items){
    const eventsFor=events.filter(e=>e.contentId===item.id);
    const poppic=computePoppicAverage(eventsFor);
    const userScore=eventsFor.filter(e=>e.userId==='rodrigo').slice(-1)[0]?.score;
    const imdb=await fetchImdbScore(item.imdbId);
    renderCard(container,item,poppic,imdb,userScore);
  }
}
document.addEventListener('DOMContentLoaded', ()=>{
  $$('.tab-btn').forEach(b=>b.addEventListener('click',()=>render()));
  document.getElementById('watch-form').addEventListener('submit', async ev=>{
    ev.preventDefault();
    const dlg=document.getElementById('watch-dialog');
    const date = document.getElementById('watch-date').valueAsDate || new Date();
    if(WATCH_TARGET){ await watchAdd({userId:'rodrigo',contentId:WATCH_TARGET.id,date:date.toISOString()}); }
    dlg.close(); await render();
  });
  render();
});
