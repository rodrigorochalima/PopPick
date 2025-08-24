(async function(){
  const form = document.getElementById('loginForm');
  const toggle = document.getElementById('togglePass');
  const pass = document.getElementById('password');
  const forgotBtn = document.getElementById('forgotBtn');
  const dlg = document.getElementById('forgotDlg');
  const askBtn = document.getElementById('askQuestion');
  const doReset = document.getElementById('doReset');

  if (toggle) toggle.addEventListener('click', () => {
    pass.type = pass.type === 'password' ? 'text' : 'password';
  });

  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const r = await fetch('/api/auth/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!data.ok) return alert(data.error || 'Falha no login');
    location.href = '/app';
  });

  if (forgotBtn) forgotBtn.addEventListener('click', ()=> dlg.showModal());

  if (askBtn) askBtn.addEventListener('click', async (e)=>{
    e.preventDefault();
    const u = document.getElementById('fUser').value.trim();
    const r = await fetch('/api/auth/forgot_start', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:u})
    });
    const data = await r.json();
    if (!data.ok) return alert(data.error || 'Usuário não encontrado');
    document.getElementById('secretQuestion').textContent = 'Pergunta: ' + data.question;
    document.getElementById('forgotStep1').classList.add('hidden');
    document.getElementById('forgotStep2').classList.remove('hidden');
  });

  if (doReset) doReset.addEventListener('click', async (e)=>{
    e.preventDefault();
    const u = document.getElementById('fUser').value.trim();
    const answer = document.getElementById('secretAnswer').value.trim();
    const newp = document.getElementById('newPassword').value.trim();
    const r = await fetch('/api/auth/forgot_finish', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:u, answer, new_password:newp})
    });
    const data = await r.json();
    if (!data.ok) return alert(data.error || 'Não foi possível redefinir');
    alert('Senha alterada. Faça login.');
    dlg.close();
  });
})();
