import os, json, datetime, hashlib
from io import BytesIO
from flask import Flask, request, jsonify, render_template, redirect, url_for, session, send_file
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import requests

from src.config import (
    DATABASE_URL, SECRET_KEY, TMDB_API_KEY,
    ADMIN_USER, ADMIN_PASS
)

# --- app base ---
app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)
app.secret_key = SECRET_KEY

# --- banco ---
engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, future=True)

# util
def sha256(s:str)->str: 
    return hashlib.sha256((s or "").encode()).hexdigest()

def re_slug(s:str)->str:
    import re
    return re.sub(r'[^a-z0-9]+','-', (s or "").lower()).strip('-')

def column_exists(conn, table, name):
    # PRAGMA funciona em SQLite; em Postgres usaremos migrations no futuro
    try:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).mappings().all()
        return any(r["name"] == name for r in rows)
    except Exception:
        return False

def init_db():
    """Cria tabelas se não existirem, aplica migrações simples e garante o admin inicial."""
    with engine.begin() as conn:
        # users
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT DEFAULT 'admin'
        );
        """))

        # migrações não destrutivas (adiciona colunas se faltarem)
        if not column_exists(conn, "users", "secret_question"):
            conn.execute(text("ALTER TABLE users ADD COLUMN secret_question TEXT"))
        if not column_exists(conn, "users", "secret_answer_hash"):
            conn.execute(text("ALTER TABLE users ADD COLUMN secret_answer_hash TEXT"))

        # movies
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS movies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT UNIQUE,
          title TEXT NOT NULL,
          year INTEGER,
          studio TEXT,
          tmdb_id INTEGER,
          watched INTEGER DEFAULT 0,
          views INTEGER DEFAULT 0,
          rating INTEGER
        );
        """))

        # history
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS view_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          movie_id INTEGER,
          watched_at TEXT,
          FOREIGN KEY(movie_id) REFERENCES movies(id)
        );
        """))

        # 🔐 admin inicial (apenas se não houver nenhum usuário)
        total_users = conn.execute(text("SELECT COUNT(*) AS c FROM users")).fetchone().c
        if total_users == 0:
            conn.execute(text("""
              INSERT INTO users (username,name,password_hash,role)
              VALUES (:u,:n,:p,'admin')
            """), {"u": ADMIN_USER, "n": "Administrador POPPIC", "p": sha256(ADMIN_PASS)})

        # demos (apenas se não existirem)
        if not conn.execute(text("SELECT 1 FROM movies WHERE slug='procurando-nemo-2003'")).fetchone():
            conn.execute(text("""
              INSERT INTO movies (slug,title,year,studio,tmdb_id,watched,views,rating)
              VALUES ('procurando-nemo-2003','Procurando Nemo',2003,'disney',12,1,4,9)
            """))
        if not conn.execute(text("SELECT 1 FROM movies WHERE slug='apollo-11-2019'")).fetchone():
            conn.execute(text("""
              INSERT INTO movies (slug,title,year,studio,tmdb_id,watched,views,rating)
              VALUES ('apollo-11-2019','Apollo 11',2019,'nasa',504172,0,0,NULL)
            """))
        if not conn.execute(text("SELECT 1 FROM movies WHERE slug='jurassic-park-1993'")).fetchone():
            conn.execute(text("""
              INSERT INTO movies (slug,title,year,studio,tmdb_id,watched,views,rating)
              VALUES ('jurassic-park-1993','Jurassic Park',1993,'universal',329,0,0,NULL)
            """))

init_db()

# -------------------- AUTH --------------------
@app.post("/api/auth/login")
def api_login():
    data = request.get_json(force=True, silent=True) or {}
    u = (data.get("username") or "").strip().lower()
    p = (data.get("password") or "").strip()
    with engine.begin() as conn:
        row = conn.execute(text("SELECT id,username,name,password_hash FROM users WHERE lower(username)=:u"),
                           {"u": u}).fetchone()
        if not row or sha256(p) != row.password_hash:
            return jsonify({"ok": False, "error": "Usuário ou senha inválidos"}), 401
        session["user"] = {"id": row.id, "name": row.name, "username": row.username}
        return jsonify({"ok": True, "user": session["user"]})

@app.post("/api/auth/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})

# Esqueci a senha – etapa 1: retorna pergunta
@app.post("/api/auth/forgot_start")
def forgot_start():
    data = request.get_json(force=True, silent=True) or {}
    u = (data.get("username") or "").strip().lower()
    with engine.begin() as conn:
        row = conn.execute(text("SELECT secret_question FROM users WHERE lower(username)=:u"), {"u": u}).fetchone()
        if not row or not (row.secret_question or "").strip():
            return jsonify({"ok": False, "error": "Usuário não encontrado ou sem pergunta configurada"}), 404
        return jsonify({"ok": True, "question": row.secret_question})

# Esqueci a senha – etapa 2: confirma resposta e define nova senha
@app.post("/api/auth/forgot_finish")
def forgot_finish():
    data = request.get_json(force=True, silent=True) or {}
    u = (data.get("username") or "").strip().lower()
    a = (data.get("answer") or "").strip()
    newp = (data.get("new_password") or "").strip()
    if len(newp) < 4:
        return jsonify({"ok": False, "error": "Senha muito curta"}), 400
    with engine.begin() as conn:
        row = conn.execute(text("SELECT id,secret_answer_hash FROM users WHERE lower(username)=:u"), {"u": u}).fetchone()
        if not row or not (row.secret_answer_hash or ""):
            return jsonify({"ok": False, "error": "Usuário sem pergunta/resposta configuradas"}), 400
        if sha256(a) != row.secret_answer_hash:
            return jsonify({"ok": False, "error": "Resposta incorreta"}), 401
        conn.execute(text("UPDATE users SET password_hash=:p WHERE id=:id"),
                     {"p": sha256(newp), "id": row.id})
    return jsonify({"ok": True})

# -------------------- CONTA (logado) --------------------
def require_user():
    return session.get("user")

# trocar senha (logado)
@app.post("/api/account/change_password")
def change_password():
    user = require_user()
    if not user: return jsonify({"ok": False}), 401
    data = request.get_json(force=True) or {}
    oldp = data.get("old_password","")
    newp = data.get("new_password","")
    if len(newp) < 4: return jsonify({"ok": False, "error":"Senha muito curta"}), 400
    with engine.begin() as conn:
        row = conn.execute(text("SELECT password_hash FROM users WHERE id=:id"), {"id": user["id"]}).fetchone()
        if not row or sha256(oldp) != row.password_hash:
            return jsonify({"ok": False, "error":"Senha atual incorreta"}), 401
        conn.execute(text("UPDATE users SET password_hash=:p WHERE id=:id"),
                     {"p": sha256(newp), "id": user["id"]})
    return jsonify({"ok": True})

# atualizar nome/username + pergunta/ resposta secreta
@app.post("/api/account/update_profile")
def update_profile():
    user = require_user()
    if not user: return jsonify({"ok": False}), 401
    data = request.get_json(force=True) or {}
    new_name = (data.get("name") or "").strip()
    new_user = (data.get("username") or "").strip()
    q = (data.get("secret_question") or "").strip()
    a = (data.get("secret_answer") or "").strip()

    if not new_name or not new_user:
        return jsonify({"ok": False, "error":"Nome e usuário são obrigatórios"}), 400

    with engine.begin() as conn:
        # username único
        exists = conn.execute(text("SELECT 1 FROM users WHERE lower(username)=:u AND id<>:id"),
                              {"u": new_user.lower(), "id": user["id"]}).fetchone()
        if exists:
            return jsonify({"ok": False, "error":"Esse usuário já existe"}), 400

        params = {"name": new_name, "username": new_user, "id": user["id"]}
        set_ans = ""
        if q and a:
            set_ans = ", secret_question=:q, secret_answer_hash=:ah"
            params["q"] = q
            params["ah"] = sha256(a)

        conn.execute(text(f"UPDATE users SET name=:name, username=:username{set_ans} WHERE id=:id"), params)

    # atualiza sessão
    session["user"]["name"] = new_name
    session["user"]["username"] = new_user
    return jsonify({"ok": True, "user": session["user"]})

# -------------------- MOVIES --------------------
@app.get("/api/movies")
def api_movies():
    q = (request.args.get("q") or "").lower()
    f = (request.args.get("filter") or "todos").lower()
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT * FROM movies ORDER BY title ASC")).mappings().all()
        items = []
        for r in rows:
            if f != "todos" and (r["studio"] or "") != f:
                continue
            if q and (q not in (r["title"] or "").lower()):
                continue
            items.append(dict(r))
        return jsonify({"ok": True, "items": items})

@app.post("/api/movies")
def api_add_movie():
    data = request.get_json(force=True)
    title = data.get("title","").strip()
    year = int(data.get("year") or 0)
    studio = (data.get("studio") or "").strip()
    tmdb_id = int(data.get("tmdbId") or 0) or None
    slug = re_slug(f"{title}-{year}")
    with engine.begin() as conn:
        conn.execute(text("""
          INSERT INTO movies (slug,title,year,studio,tmdb_id,watched,views,rating)
          VALUES (:slug,:title,:year,:studio,:tmdb,0,0,NULL)
        """), {"slug":slug,"title":title,"year":year,"studio":studio,"tmdb":tmdb_id})
    return jsonify({"ok": True})

@app.post("/api/movies/<int:movie_id>/toggle_watch")
def api_toggle_watch(movie_id):
    with engine.begin() as conn:
        r = conn.execute(text("SELECT watched,views FROM movies WHERE id=:id"),{"id":movie_id}).fetchone()
        if not r: return jsonify({"ok": False}), 404
        watched = 0 if r.watched else 1
        views = r.views + 1 if watched else max(0, r.views-1)
        conn.execute(text("UPDATE movies SET watched=:w, views=:v WHERE id=:id"),
                     {"w":watched,"v":views,"id":movie_id})
        if watched:
            conn.execute(text("INSERT INTO view_history (movie_id,watched_at) VALUES (:id,:dt)"),
                         {"id":movie_id,"dt":datetime.datetime.utcnow().isoformat()})
    return jsonify({"ok": True})

@app.post("/api/movies/<int:movie_id>/rate")
def api_rate(movie_id):
    data = request.get_json(force=True)
    rating = int(data.get("rating") or 0)
    with engine.begin() as conn:
        r = conn.execute(text("SELECT watched FROM movies WHERE id=:id"),{"id":movie_id}).fetchone()
        if not r: return jsonify({"ok": False}), 404
        if not r.watched:
            return jsonify({"ok": False, "error":"Avaliação só após assistir"}), 400
        conn.execute(text("UPDATE movies SET rating=:rt WHERE id=:id"),{"rt":rating,"id":movie_id})
    return jsonify({"ok": True})

# TMDB poster (opcional)
@app.get("/api/tmdb/poster/<int:tmdb_id>")
def api_tmdb_poster(tmdb_id):
    if not TMDB_API_KEY:
        return jsonify({"ok": False, "error":"TMDB_API_KEY não configurada"}), 400
    r = requests.get(f"https://api.themoviedb.org/3/movie/{tmdb_id}",
                     params={"api_key":TMDB_API_KEY, "language":"pt-BR"})
    if r.status_code != 200:
        return jsonify({"ok": False, "error":"TMDB erro"}), 502
    data = r.json()
    path = data.get("poster_path")
    return jsonify({"ok": True, "url": ("https://image.tmdb.org/t/p/w342"+path) if path else None})

# Backup/Restore
@app.get("/api/admin/backup")
def api_backup():
    with engine.begin() as conn:
        movies = [dict(x) for x in conn.execute(text("SELECT * FROM movies")).mappings().all()]
        views = [dict(x) for x in conn.execute(text("SELECT * FROM view_history")).mappings().all()]
    payload = json.dumps({"movies":movies,"view_history":views}, ensure_ascii=False, indent=2)
    return send_file(BytesIO(payload.encode("utf-8")), mimetype="application/json",
                     as_attachment=True, download_name="poppic_backup.json")

@app.post("/api/admin/restore")
def api_restore():
    payload = request.get_json(force=True, silent=True)
    if not payload: return jsonify({"ok": False, "error":"JSON inválido"}), 400
    movies = payload.get("movies",[])
    views = payload.get("view_history",[])
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM view_history"))
        conn.execute(text("DELETE FROM movies"))
        for m in movies:
            conn.execute(text("""
              INSERT INTO movies (id,slug,title,year,studio,tmdb_id,watched,views,rating)
              VALUES (:id,:slug,:title,:year,:studio,:tmdb_id,:watched,:views,:rating)
            """), m)
        for v in views:
            conn.execute(text("""
              INSERT INTO view_history (id,movie_id,watched_at)
              VALUES (:id,:movie_id,:watched_at)
            """), v)
    return jsonify({"ok": True})

# Páginas
@app.get("/")
def page_login():
    if "user" in session:
        return redirect(url_for("page_app"))
    return render_template("index.html", version="v21.0")

@app.get("/app")
def page_app():
    if "user" not in session:
        return redirect(url_for("page_login"))
    return render_template("app.html", version="v21.0", user=session["user"])

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
