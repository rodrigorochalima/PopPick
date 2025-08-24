import os, json, datetime, hashlib, base64
from io import BytesIO
from flask import Flask, request, jsonify, render_template, redirect, url_for, session, send_file
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import requests

# ======== CONFIG ========
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///poppic.db")
SECRET_KEY   = os.getenv("SECRET_KEY", "change-me-in-production")
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
ADMIN_USER   = os.getenv("ADMIN_USER", "rodrigo")
ADMIN_PASS   = os.getenv("ADMIN_PASS", "530431")

# ======== APP ========
app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)
app.secret_key = SECRET_KEY
engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, future=True)

# ======== UTILS ========
def sha256(s:str)->str: return hashlib.sha256((s or "").encode()).hexdigest()

def column_exists_sqlite(conn, table, name):
    try:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).mappings().all()
        return any(r["name"] == name for r in rows)
    except Exception:
        return False

def init_db():
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
        if not column_exists_sqlite(conn, "users", "secret_question"):
            conn.execute(text("ALTER TABLE users ADD COLUMN secret_question TEXT"))
        if not column_exists_sqlite(conn, "users", "secret_answer_hash"):
            conn.execute(text("ALTER TABLE users ADD COLUMN secret_answer_hash TEXT"))
        if not column_exists_sqlite(conn, "users", "avatar"):
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar TEXT"))  # data URL (base64)

        # movies
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS movies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT UNIQUE,
          title TEXT NOT NULL,
          year INTEGER,
          studio TEXT,
          tmdb_id INTEGER,
          tmdb_rating REAL,      -- média do TMDB
          poster_path TEXT,      -- caminho do poster no TMDB
          watched INTEGER DEFAULT 0,
          views INTEGER DEFAULT 0
        );
        """))

        # histórico
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS view_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          movie_id INTEGER,
          watched_at TEXT
        );
        """))

        # NOVO: notas por usuário (para fazer o Índice PopPic)
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS user_ratings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          movie_id INTEGER,
          rating INTEGER,
          UNIQUE(user_id, movie_id)
        );
        """))

        # admin inicial (se não houver nenhum usuário)
        total_users = conn.execute(text("SELECT COUNT(*) AS c FROM users")).fetchone().c
        if total_users == 0:
            conn.execute(text("""
              INSERT INTO users (username,name,password_hash,role)
              VALUES (:u,:n,:p,'admin')
            """), {"u": ADMIN_USER, "n": "Administrador POPPIC", "p": sha256(ADMIN_PASS)})

        # demos (se necessário)
        if not conn.execute(text("SELECT 1 FROM movies WHERE slug='jurassic-park-1993'")).fetchone():
            conn.execute(text("""
              INSERT INTO movies (slug,title,year,studio,tmdb_id,tmdb_rating,poster_path,watched,views)
              VALUES ('jurassic-park-1993','Jurassic Park',1993,'universal',329,8.2,'/jJQScmEJ770p0VCSkS8GxZx4y6G.jpg',0,0)
            """))
        if not conn.execute(text("SELECT 1 FROM movies WHERE slug='procurando-nemo-2003'")).fetchone():
            conn.execute(text("""
              INSERT INTO movies (slug,title,year,studio,tmdb_id,tmdb_rating,poster_path,watched,views)
              VALUES ('procurando-nemo-2003','Procurando Nemo',2003,'disney',12,7.8,'/eHuGQ10FUzK1mdOY69wF5pGgEf5.jpg',0,0)
            """))

init_db()

def require_user():
    return session.get("user")

# ========== PÁGINAS ==========
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

# ========== AUTH ==========
@app.post("/api/auth/login")
def api_login():
    data = request.get_json(force=True, silent=True) or {}
    u = (data.get("username") or "").strip().lower()
    p = (data.get("password") or "").strip()
    with engine.begin() as conn:
        row = conn.execute(text(
            "SELECT id,username,name,password_hash,avatar FROM users WHERE lower(username)=:u"
        ), {"u": u}).mappings().fetchone()
        if not row or sha256(p) != row["password_hash"]:
            return jsonify({"ok": False, "error": "Usuário ou senha inválidos"}), 401
        session["user"] = {"id": row["id"], "name": row["name"], "username": row["username"], "avatar": row["avatar"]}
        return jsonify({"ok": True, "user": session["user"]})

@app.post("/api/auth/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})

@app.post("/api/auth/forgot_start")
def forgot_start():
    data = request.get_json(force=True, silent=True) or {}
    u = (data.get("username") or "").strip().lower()
    with engine.begin() as conn:
        row = conn.execute(text("SELECT secret_question FROM users WHERE lower(username)=:u"), {"u": u}).fetchone()
        if not row or not (row.secret_question or "").strip():
            return jsonify({"ok": False, "error": "Usuário não encontrado ou sem pergunta configurada"}), 404
        return jsonify({"ok": True, "question": row.secret_question})

@app.post("/api/auth/forgot_finish")
def forgot_finish():
    data = request.get_json(force=True, silent=True) or {}
    u = (data.get("username") or "").strip().lower()
    a = (data.get("answer") or "").strip()
    newp = (data.get("new_password") or "").strip()
    if len(newp) < 4: return jsonify({"ok": False, "error": "Senha muito curta"}), 400
    with engine.begin() as conn:
        row = conn.execute(text("SELECT id,secret_answer_hash FROM users WHERE lower(username)=:u"), {"u": u}).fetchone()
        if not row or not (row.secret_answer_hash or ""):
            return jsonify({"ok": False, "error": "Usuário sem pergunta/resposta configuradas"}), 400
        if sha256(a) != row.secret_answer_hash:
            return jsonify({"ok": False, "error": "Resposta incorreta"}), 401
        conn.execute(text("UPDATE users SET password_hash=:p WHERE id=:id"),
                     {"p": sha256(newp), "id": row.id})
    return jsonify({"ok": True})

# ========== CONTA ==========
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
        exists = conn.execute(text("SELECT 1 FROM users WHERE lower(username)=:u AND id<>:id"),
                              {"u": new_user.lower(), "id": user["id"]}).fetchone()
        if exists:
            return jsonify({"ok": False, "error":"Esse usuário já existe"}), 400
        params = {"name": new_name, "username": new_user, "id": user["id"]}
        set_ans = ""
        if q and a:
            set_ans = ", secret_question=:q, secret_answer_hash=:ah"
            params["q"] = q; params["ah"] = sha256(a)
        conn.execute(text(f"UPDATE users SET name=:name, username=:username{set_ans} WHERE id=:id"), params)
    session["user"]["name"] = new_name
    session["user"]["username"] = new_user
    return jsonify({"ok": True, "user": session["user"]})

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

@app.post("/api/account/avatar")
def upload_avatar():
    """Recebe um dataURL (PNG/JPEG) já recortado no cliente e salva no usuário."""
    user = require_user()
    if not user: return jsonify({"ok": False}), 401
    data = request.get_json(force=True) or {}
    data_url = data.get("data_url","")
    if not data_url.startswith("data:image/"):
        return jsonify({"ok": False, "error":"Imagem inválida"}), 400
    with engine.begin() as conn:
        conn.execute(text("UPDATE users SET avatar=:a WHERE id=:id"), {"a": data_url, "id": user["id"]})
        row = conn.execute(text("SELECT name,username,avatar FROM users WHERE id=:id"), {"id": user["id"]}).mappings().fetchone()
    session["user"]["avatar"] = row["avatar"]
    return jsonify({"ok": True, "user": session["user"]})

# ========== TMDB ==========
def tmdb_headers():
    return {"accept": "application/json"}

@app.get("/api/tmdb/search")
def tmdb_search():
    if not TMDB_API_KEY:
        return jsonify({"ok": False, "error":"TMDB_API_KEY não configurada"}), 400
    q = (request.args.get("q") or "").strip()
    if not q: return jsonify({"ok": True, "results": []})
    r = requests.get("https://api.themoviedb.org/3/search/movie",
                     params={"api_key": TMDB_API_KEY, "language":"pt-BR", "query": q, "page":1},
                     headers=tmdb_headers())
    if r.status_code != 200:
        return jsonify({"ok": False, "error":"Erro TMDB"}), 502
    data = r.json().get("results", [])[:8]
    results = [{"id":m["id"], "title":m["title"], "year": (m.get("release_date","")[:4] or ""), "rating": m.get("vote_average"), "poster_path": m.get("poster_path")} for m in data]
    return jsonify({"ok": True, "results": results})

@app.post("/api/movies/from_tmdb")
def add_from_tmdb():
    if not TMDB_API_KEY:
        return jsonify({"ok": False, "error":"TMDB_API_KEY não configurada"}), 400
    payload = request.get_json(force=True) or {}
    tmdb_id = int(payload.get("tmdb_id") or 0)
    studio = (payload.get("studio") or "").strip() or None
    if not tmdb_id: return jsonify({"ok": False}), 400
    # busca detalhes
    r = requests.get(f"https://api.themoviedb.org/3/movie/{tmdb_id}",
                     params={"api_key": TMDB_API_KEY, "language":"pt-BR"},
                     headers=tmdb_headers())
    if r.status_code != 200:
        return jsonify({"ok": False, "error":"Erro TMDB"}), 502
    d = r.json()
    title = d.get("title","").strip()
    year  = (d.get("release_date","")[:4] or None)
    rating = d.get("vote_average")
    poster = d.get("poster_path")
    slug = "-".join([str(title or "").lower().replace(" ","-"), str(year or "")]).strip("-")
    with engine.begin() as conn:
        exists = conn.execute(text("SELECT 1 FROM movies WHERE tmdb_id=:id OR slug=:slug"), {"id": tmdb_id, "slug": slug}).fetchone()
        if exists: return jsonify({"ok": True, "dup": True})
        conn.execute(text("""
          INSERT INTO movies (slug,title,year,studio,tmdb_id,tmdb_rating,poster_path,watched,views)
          VALUES (:slug,:title,:year,:studio,:tmdb,:rt,:poster,0,0)
        """), {"slug":slug,"title":title,"year":year,"studio":studio,"tmdb":tmdb_id,"rt":rating,"poster":poster})
    return jsonify({"ok": True})

# ========== FILMES / NOTAS ==========
@app.get("/api/movies")
def api_movies():
    user = require_user()
    uid = user["id"] if user else None
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
            # minha nota
            my = None
            if uid:
                m = conn.execute(text("SELECT rating FROM user_ratings WHERE user_id=:u AND movie_id=:m"),
                                 {"u": uid, "m": r["id"]}).fetchone()
                my = m.rating if m else None
            # índice poppic
            avg = conn.execute(text("SELECT AVG(rating) AS a FROM user_ratings WHERE movie_id=:m"),
                               {"m": r["id"]}).fetchone().a
            items.append({
                **dict(r),
                "my_rating": int(my) if my is not None else None,
                "site_index": round(avg,1) if avg is not None else None
            })
        return jsonify({"ok": True, "items": items})

@app.post("/api/movies/<int:movie_id>/toggle_watch")
def api_toggle_watch(movie_id):
    user = require_user()
    uid = user["id"] if user else None
    with engine.begin() as conn:
        r = conn.execute(text("SELECT watched,views FROM movies WHERE id=:id"),{"id":movie_id}).fetchone()
        if not r: return jsonify({"ok": False}), 404
        watched = 0 if r.watched else 1
        views = r.views + 1 if watched else max(0, r.views-1)
        conn.execute(text("UPDATE movies SET watched=:w, views=:v WHERE id=:id"),
                     {"w":watched,"v":views,"id":movie_id})
        if watched and uid:
            conn.execute(text("INSERT INTO view_history (user_id,movie_id,watched_at) VALUES (:u,:m,:dt)"),
                         {"u":uid,"m":movie_id,"dt":datetime.datetime.utcnow().isoformat()})
    return jsonify({"ok": True})

@app.post("/api/movies/<int:movie_id>/rate")
def api_rate(movie_id):
    user = require_user()
    if not user: return jsonify({"ok": False}), 401
    data = request.get_json(force=True)
    rating = int(data.get("rating") or 0)
    rating = max(0, min(10, rating))
    with engine.begin() as conn:
        r = conn.execute(text("SELECT watched FROM movies WHERE id=:id"),{"id":movie_id}).fetchone()
        if not r: return jsonify({"ok": False}), 404
        if not r.watched:
            return jsonify({"ok": False, "error":"Avaliação só após assistir"}), 400
        # upsert na nota do usuário
        exists = conn.execute(text("SELECT id FROM user_ratings WHERE user_id=:u AND movie_id=:m"),
                              {"u": user["id"], "m": movie_id}).fetchone()
        if exists:
            conn.execute(text("UPDATE user_ratings SET rating=:r WHERE id=:id"),
                         {"r": rating, "id": exists.id})
        else:
            conn.execute(text("INSERT INTO user_ratings (user_id,movie_id,rating) VALUES (:u,:m,:r)"),
                         {"u": user["id"], "m": movie_id, "r": rating})
    return jsonify({"ok": True})

# ========== BACKUP ==========
@app.get("/api/admin/backup")
def api_backup():
    with engine.begin() as conn:
        movies = [dict(x) for x in conn.execute(text("SELECT * FROM movies")).mappings().all()]
        views  = [dict(x) for x in conn.execute(text("SELECT * FROM view_history")).mappings().all()]
        ratings= [dict(x) for x in conn.execute(text("SELECT * FROM user_ratings")).mappings().all()]
    payload = json.dumps({"movies":movies,"view_history":views,"user_ratings":ratings}, ensure_ascii=False, indent=2)
    return send_file(BytesIO(payload.encode("utf-8")), mimetype="application/json",
                     as_attachment=True, download_name="poppic_backup.json")

@app.post("/api/admin/restore")
def api_restore():
    payload = request.get_json(force=True, silent=True)
    if not payload: return jsonify({"ok": False, "error":"JSON inválido"}), 400
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM view_history"))
        conn.execute(text("DELETE FROM user_ratings"))
        conn.execute(text("DELETE FROM movies"))
        for m in payload.get("movies",[]):
            conn.execute(text("""
              INSERT INTO movies (id,slug,title,year,studio,tmdb_id,tmdb_rating,poster_path,watched,views)
              VALUES (:id,:slug,:title,:year,:studio,:tmdb_id,:tmdb_rating,:poster_path,:watched,:views)
            """), m)
        for v in payload.get("view_history",[]):
            conn.execute(text("INSERT INTO view_history (id,user_id,movie_id,watched_at) VALUES (:id,:user_id,:movie_id,:watched_at)"), v)
        for r in payload.get("user_ratings",[]):
            conn.execute(text("INSERT INTO user_ratings (id,user_id,movie_id,rating) VALUES (:id,:user_id,:movie_id,:rating)"), r)
    return jsonify({"ok": True})

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
