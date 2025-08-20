import { $, csv } from '../js/utils.js';
import { init, userGet, userSave, exportUserCSV, msgSend, msgInbox } from '../js/db.js';
const USER_ID='rodrigo';

async function load(){
  await init();
  const u=(await userGet(USER_ID))||{id:USER_ID};
  $('#username').value=u.id||''; $('#email').value=u.email||''; $('#whatsapp').value=u.whatsapp||'';
  if(u.avatar) $('#avatar').src=u.avatar;
  const inbox=await msgInbox(USER_ID); const ul=$('#inbox'); ul.innerHTML='';
  inbox.reverse().forEach(m=>{ const li=document.createElement('li'); li.textContent=`@${m.from}: ${m.text}`; ul.appendChild(li); });
}
document.addEventListener('DOMContentLoaded', ()=>{
  load();
  $('#save-profile').addEventListener('click', async ()=>{
    const u={id:$('#username').value.trim()||USER_ID,email:$('#email').value.trim(),whatsapp:$('#whatsapp').value.trim(),avatar:$('#avatar').src||''};
    await userSave(u); alert('Perfil salvo.');
  });
  $('#avatar-file').addEventListener('change', async ev=>{
    const file=ev.target.files[0]; if(!file) return; const url=URL.createObjectURL(file); const img=new Image();
    img.onload=()=>{ const s=Math.min(img.width,img.height),x=(img.width-s)/2,y=(img.height-s)/2; const c=document.createElement('canvas'); c.width=256;c.height=256; const ctx=c.getContext('2d'); ctx.drawImage(img,x,y,s,s,0,0,256,256); $('#avatar').src=c.toDataURL('image/jpeg',.9); };
    img.src=url;
  });
  $('#exportar').addEventListener('click', async ()=>{
    const rows=await exportUserCSV(USER_ID); const blob=new Blob([csv(rows)],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='poppick_backup_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
  });
  $('#importar-json').addEventListener('change', async ev=>{
    const file=ev.target.files[0]; if(!file) return; const text=await file.text();
    try{ const obj=JSON.parse(text); await userSave(obj); alert('Dados restaurados.'); load(); }catch(e){ alert('JSON inválido'); }
  });
  $('#enviar-msg').addEventListener('click', async ()=>{
    const to=$('#mensagem-para').value.trim().replace(/^@/,''); const text=$('#mensagem-conteudo').value.trim(); if(!to||!text) return;
    await msgSend({from:USER_ID,to,text,at:new Date().toISOString()}); $('#mensagem-conteudo').value=''; alert('Mensagem enviada.');
  });
});
