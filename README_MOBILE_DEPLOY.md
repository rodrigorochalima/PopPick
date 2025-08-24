# POPPIC v21.0 — Flask + PWA (deploy pelo celular)

## Passo a passo (Render.com)
1) Crie conta no **Render.com** (pelo celular).  
2) Toque em **New → Web Service → Build & Deploy from Git** e escolha este repositório.  
3) **Build Command**: `pip install -r requirements.txt`  
4) **Start Command**: `python src/app.py`  
5) **Environment → Add Variable**  
   - `SECRET_KEY` → um texto longo aleatório  
   - `TMDB_API_KEY` → sua chave do TMDB (v3)  
   - (opcional) `DATABASE_URL` → quando quiser Postgres (ex.: Neon).  
6) Abra a URL do Render → **Login** `rodrigo / 530431`.  
7) No iPhone (Safari): **Compartilhar → Adicionar à Tela de Início** (vira app/PWA).

## Observações
- Por padrão usa **SQLite** (arquivo local). Em produção use `DATABASE_URL` (Postgres).  
- Os dados ficam **separados do código**. Atualizar o site **não apaga** o banco.  
- Admin → **Backup/Restore** em JSON.
