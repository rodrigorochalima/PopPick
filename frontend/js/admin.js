import { $ } from '../js/utils.js';
import { init, usersAll, userDelete } from '../js/db.js';

function inviteLink(name,email){
  const token=btoa(JSON.stringify({name,email,ts:Date.now()}));
  return location.origin + location.pathname.replace('admin.html','') + 'index.html#invite='+token + '  | senha: Disney123';
}
async function renderUsers(){
  const ul=document.getElementById('lista-usuarios'); ul.innerHTML='';
  const users=await usersAll();
  users.forEach(u=>{
    const li=document.createElement('li');
    li.innerHTML=`<span>@${u.id}</span><span><button class="btn-del">Excluir</button></span>`;
    li.querySelector('.btn-del').addEventListener('click',async()=>{ if(confirm('Excluir @'+u.id+'?')){ await userDelete(u.id); renderUsers(); }});
    ul.appendChild(li);
  });
}
document.addEventListener('DOMContentLoaded', ()=>{
  init().then(renderUsers);
  document.getElementById('gerar-convite').addEventListener('click',()=>{
    const nome=document.getElementById('novo-usuario-nome').value.trim();
    const email=document.getElementById('novo-usuario-email').value.trim();
    document.getElementById('link-convite').textContent = inviteLink(nome,email);
  });
  document.getElementById('exportar-geral').addEventListener('click', async ()=>{
    const {backupAll}=await import('../js/db.js');
    const data=await backupAll(); const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='poppick_backup_'+new Date().toISOString().slice(0,10)+'.json'; a.click();
  });
  document.getElementById('importar-geral').addEventListener('change', async ev=>{
    const file=ev.target.files[0]; if(!file) return; const text=await file.text();
    try{ const obj=JSON.parse(text); const {restoreAll}=await import('../js/db.js'); await restoreAll(obj); alert('Backup restaurado.'); renderUsers(); }catch(e){ alert('JSON inválido'); }
  });
});
