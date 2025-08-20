export const $ = (sel, root=document) => root.querySelector(sel);
export const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
export const sleep = ms => new Promise(r=>setTimeout(r,ms));
export function formatDate(d){ if(!d) return ''; const dt=(typeof d==='string')? new Date(d): d; return dt.toISOString().slice(0,10); }
export function csv(rows){ return rows.map(r=>r.map(v=>(''+v).replaceAll('"','""')).map(v=>`"${v}"`).join(',')).join('\n'); }
export function starsHTML(value=0,max=10){ let html=''; for(let i=1;i<=max;i++){ html += `<button class="star ${i<=value?'on':'off'}" data-v="${i}" aria-label="${i} estrela">★</button>`;} return html; }
export function badgeScore(el, value){ el.textContent = (value==null || isNaN(value)) ? 'N/A' : (+value).toFixed(1); }
