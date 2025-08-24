(async function(){
  const form = document.getElementById('loginForm');
  const toggle = document.getElementById('togglePass');
  const pass = document.getElementById('password');

  toggle.addEventListener('click', () => {
    pass.type = pass.type === 'password' ? 'text' : 'password';
  });

  form.addEventListener('submit', async (e) => {
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
})();
