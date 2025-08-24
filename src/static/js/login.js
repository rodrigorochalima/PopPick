(function(){
  const F = document.getElementById('loginForm');
  const U = document.getElementById('user');
  const P = document.getElementById('pass');
  const T = document.getElementById('togglePw');
  const forgotBtn = document.getElementById('forgotBtn');

  // mostrar/ocultar senha
  T.addEventListener('click', ()=>{
    P.type = P.type === 'password' ? 'text' : 'password';
  });

  F.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const username = (U.value||'').trim();
    const password = (P.value||'').trim();
    if(!username || !password) return alert('Preencha usuário e senha.');

    const r = await fetch('/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username, password })
    });
    const d = await r.json();
    if(!d.ok) return alert(d.error || 'Erro de login');
    location.href = '/app';
  });

  // recuperação de senha
  const dlg = document.getElementById('forgotModal');
  const fUser = document.getElementById('fUser');
  const fStep2 = document.getElementById('fStep2');
  const fQuestion = document.getElementById('fQuestion');
  const fAnswer = document.getElementById('fAnswer');
  const fNew = document.getElementById('fNew');
  document.getElementById('fCancel').onclick = ()=> dlg.close();
  forgotBtn.onclick = ()=>{ fUser.value=''; fStep2.style.display='none'; dlg.showModal(); };

  document.getElementById('fNext').onclick = async ()=>{
    if (fStep2.style.display==='none'){
      const r = await fetch('/api/auth/forgot_start', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username: (fUser.value||'').trim() })
      });
      const d = await r.json();
      if(!d.ok) return alert(d.error || 'Usuário não encontrado');
      fQuestion.textContent = d.question;
      fStep2.style.display = '';
    } else {
      const payload = {
        username: (fUser.value||'').trim(),
        answer: (fAnswer.value||'').trim(),
        new_password: (fNew.value||'').trim()
      };
      const r = await fetch('/api/auth/forgot_finish', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if(!d.ok) return alert(d.error || 'Erro');
      alert('Senha alterada. Faça login.');
      dlg.close();
    }
  };
})();
