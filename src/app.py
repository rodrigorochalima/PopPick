import os, json, base64, io, datetime as dt
from flask import Flask, request, jsonify, render_template, redirect, session, send_file
from flask_cors import CORS
from sqlalchemy import create_engine, text
import requests
import os, json, base64, io, datetime as dt
from flask import Flask, request, jsonify, render_template, redirect, session, send_file
from flask_cors import CORS
from sqlalchemy import create_engine, text
import requests

# Import compatível com execução local (python src/app.py) e via package (waitress src.app:app)
try:
    from .config import DATABASE_URL, SECRET_KEY, TMDB_API_KEY  # quando importado como package: src.config
except ImportError:
    from config import DATABASE_URL, SECRET_KEY, TMDB_API_KEY    # quando executado direto: python src/app.py

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = SECRET_KEY or "dev-key"
CORS(app)
engine = create_engine(DATABASE_URL, future=True)

# ---------- DB INIT ----------
def init_db():
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE, name TEXT, password_hash TEXT,
            role TEXT DEFAULT 'admin',
            secret_question TEXT, secret_answer TEXT,
            avatar BLOB
        )"""))
        conn.execute(text("""CREATE TABLE IF NOT EXISTS movies(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tmdb_id INTEGER, title TEXT, year INTEGER, studio TEXT,
            poster_path TEXT, tmdb_rating REAL
        )"""))
        conn.execute(text("""CREATE TABLE IF NOT EXISTS ratings(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER, movie_id INTEGER, rating INTEGER,
            UNIQUE(user_id, movie_id)
        )"""))
        conn.execute(text("""CREATE TABLE IF NOT EXISTS watch_events(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER, movie_id INTEGER, watched_at TEXT
        )"""))
        # admin default (permite login inicial)
        conn.execute(text("""INSERT OR IGNORE INTO users(username,name,password_hash,role)
                             VALUES('rodrigo','Administrador','530431','admin')"""))

init_db()

# ---------- HELPERS ----------
def require_login():
    if 'uid' not in session: return False
    return True

def current_uid():
    return session.get('uid')

def tmdb_headers():
    return {"Authorization": f"Bearer {TMDB_API_KEY}"} if TMDB_API_KEY and TMDB_API_KEY.startswith("ey") else {}

def tmdb_get(url, params=None):
    if TMDB_API_KEY:
        if url.startswith("/"): url = url[1:]
        base = "https://api.themoviedb.org/3/"
        r = requests.get(base+url, params=params or {}, headers=tmdb_headers(), timeout=15)
        r.raise_for_status()
        return r.json()
    return {}

# ---------- ROUTES PAGES ----------
@app.get("/")
def page_login():
    if 'uid' in session: return redirect("/app")
    return render_template("index.html")

@app.get("/app")
def page_app():
    if not require_login(): return redirect("/")
    # simples: injeta user no template
    with engine.begin() as conn:
        row = conn.execute(text("SELECT name FROM users WHERE id=:u"), {"u": current_uid()}).mappings().first()
    return render_template("app.html", user={"name": row["name"] if row else "Usuário"})

# ---------- AUTH ----------
@app.post("/api/auth/login")
def api_login():
    data = request.get_json() or {}
    u, p = data.get("username","").strip(), data.get("password","").strip()
    with engine.begin() as conn:
        row = conn.execute(text("SELECT id,password_hash FROM users WHERE username=:u"), {"u": u}).mappings().first()
    if not row or row["password_hash"] != p:
        return jsonify(ok=False, error="Usuário ou senha inválidos"), 200
    session["uid"] = row["id"]
    return jsonify(ok=True)

@app.post("/api/auth/logout")
def api_logout():
    session.clear()
    return jsonify(ok=True)

@app.post("/api/auth/forgot_start")
def api_forgot_start():
    data = request.get_json() or {}
    u = data.get("username","").strip()
    with engine.begin() as conn:
        row = conn.execute(text("SELECT secret_question FROM users WHERE username=:u"), {"u": u}).mappings().first()
    if not row: return jsonify(ok=False, error="Usuário não encontrado")
    q = row["secret_question"] or "Pergunta secreta não definida."
    return jsonify(ok=True, question=q)

@app.post("/api/auth/forgot_finish")
def api_forgot_finish():
    d = request.get_json() or {}
    u, ans, new = d.get("username",""), d.get("answer",""), d.get("new_password","")
    with engine.begin() as conn:
        row = conn.execute(text("SELECT id,secret_answer FROM users WHERE username=:u"), {"u": u}).mappings().first()
        if not row or (row["secret_answer"] or "").strip().lower() != ans.strip().lower():
            return jsonify(ok=False, error="Resposta incorreta")
        conn.execute(text("UPDATE users SET password_hash=:p WHERE id=:i"), {"p": new, "i": row["id"]})
    return jsonify(ok=True)

# ---------- ACCOUNT ----------
@app.post("/api/account/update_profile")
def api_update_profile():
    if not require_login(): return ("",401)
    d = request.get_json() or {}
    with engine.begin() as conn:
        conn.execute(text("""UPDATE users SET name=:n, username=:u, secret_question=:q, secret_answer=:a WHERE id=:i"""),
                     {"n": d.get("name"), "u": d.get("username"), "q": d.get("secret_question"), "a": d.get("secret_answer"), "i": current_uid()})
    return jsonify(ok=True)

@app.post("/api/account/change_password")
def api_change_password():
    if not require_login(): return ("",401)
    d = request.get_json() or {}
    with engine.begin() as conn:
        row = conn.execute(text("SELECT password_hash FROM users WHERE id=:i"), {"i": current_uid()}).mappings().first()
        if not row or row["password_hash"] != d.get("old_password"): return jsonify(ok=False, error="Senha atual incorreta")
        conn.execute(text("UPDATE users SET password_hash=:p WHERE id=:i"), {"p": d.get("new_password"), "i": current_uid()})
    return jsonify(ok=True)

@app.post("/api/account/avatar")
def api_avatar():
    if not require_login(): return ("",401)
    d = request.get_json() or {}
    b64 = (d.get("data_url","").split(",",1)[1] if "data:" in d.get("data_url","") else d.get("data_url"))
    raw = base64.b64decode(b64) if b64 else b""
    with engine.begin() as conn:
        conn.execute(text("UPDATE users SET avatar=:a WHERE id=:i"), {"a": raw, "i": current_uid()})
    return jsonify(ok=True)

# ---------- MOVIES ----------
@app.get("/api/movies")
def api_movies():
    if not require_login(): return ("",401)
    q = (request.args.get("q") or "").strip().lower()
    f = (request.args.get("filter") or "todos").strip().lower()
    with engine.begin() as conn:
        rows = conn.execute(text("""
          SELECT m.id, m.tmdb_id, m.title, m.year, m.studio, m.poster_path, m.tmdb_rating,
                 (SELECT rating FROM ratings r WHERE r.user_id=:u AND r.movie_id=m.id) AS my_rating,
                 (SELECT round(avg(rating),1) FROM ratings r WHERE r.movie_id=m.id) AS site_index,
                 (SELECT COUNT(*) FROM watch_events w WHERE w.user_id=:u AND w.movie_id=m.id) AS watch_count,
                 (SELECT substr(MAX(watched_at),1,10) FROM watch_events w WHERE w.user_id=:u AND w.movie_id=m.id) AS last_watched
          FROM movies m
          WHERE (:f='todos' OR lower(IFNULL(studio,''))=:f)
            AND ( :q='' OR lower(m.title) LIKE :pat )
          ORDER BY m.title
        """), {"u": current_uid(), "f": f, "q": q, "pat": f"%{q}%" }).mappings().all()
    return jsonify(ok=True, items=[dict(r) for r in rows])

@app.post("/api/movies/from_tmdb")
def api_add_from_tmdb():
    if not require_login(): return ("",401)
    d = request.get_json() or {}
    tmdb_id, studio = int(d.get("tmdb_id")), (d.get("studio") or "")
    info = tmdb_get(f"movie/{tmdb_id}", params={"language":"pt-BR"})
    title = info.get("title") or info.get("original_title"); year = (info.get("release_date") or "0000")[:4]
    poster = info.get("poster_path"); rating = info.get("vote_average")
    with engine.begin() as conn:
        # evita duplicar
        row = conn.execute(text("SELECT id FROM movies WHERE tmdb_id=:t"), {"t": tmdb_id}).mappings().first()
        if row: return jsonify(ok=True, id=row["id"])
        conn.execute(text("""INSERT INTO movies(tmdb_id,title,year,studio,poster_path,tmdb_rating)
                             VALUES(:t,:title,:y,:s,:p,:r)"""),
                     {"t":tmdb_id,"title":title,"y":int(year) if year.isdigit() else None,"s":studio,"p":poster,"r":rating})
    return jsonify(ok=True)

@app.post("/api/movies/relink")
def api_relink():
    if not require_login(): return ("",401)
    d = request.get_json() or {}
    movie_id, tmdb_id = int(d.get("movie_id")), int(d.get("tmdb_id"))
    info = tmdb_get(f"movie/{tmdb_id}", params={"language":"pt-BR"})
    with engine.begin() as conn:
        conn.execute(text("""UPDATE movies
                             SET tmdb_id=:t, title=:title, year=:y, poster_path=:p, tmdb_rating=:r
                             WHERE id=:id"""),
                     {"t":tmdb_id,"title":info.get("title") or info.get("original_title"),
                      "y": int((info.get('release_date') or '0000')[:4]) if (info.get('release_date') or '0')[:4].isdigit() else None,
                      "p": info.get("poster_path"), "r": info.get("vote_average"), "id": movie_id})
    return jsonify(ok=True)

@app.post("/api/movies/<int:movie_id>/rate")
def api_rate(movie_id):
    if not require_login(): return ("",401)
    rating = int((request.get_json() or {}).get("rating",0))
    if rating<1 or rating>10: return jsonify(ok=False, error="1..10")
    with engine.begin() as conn:
        conn.execute(text("""INSERT INTO ratings(user_id,movie_id,rating) VALUES(:u,:m,:r)
                             ON CONFLICT(user_id,movie_id) DO UPDATE SET rating=excluded.rating"""),
                     {"u": current_uid(), "m": movie_id, "r": rating})
    return jsonify(ok=True)

@app.post("/api/movies/<int:movie_id>/watch")
def api_watch(movie_id):
    if not require_login(): return ("",401)
    when = (request.get_json() or {}).get("when") or dt.datetime.utcnow().isoformat()
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO watch_events(user_id,movie_id,watched_at) VALUES(:u,:m,:w)"),
                     {"u": current_uid(), "m": movie_id, "w": when})
    return jsonify(ok=True)

# ---------- TMDB API (search + details) ----------
@app.get("/api/tmdb/search")
def api_tmdb_search():
    if not require_login(): return ("",401)
    q = request.args.get("q","")
    if not TMDB_API_KEY: return jsonify(ok=False, error="TMDB não configurado")
    data = tmdb_get("search/movie", params={"query": q, "language":"pt-BR", "include_adult": "false"})
    res = []
    for it in data.get("results",[])[:20]:
        res.append({"id": it["id"], "title": it.get("title") or it.get("original_title"),
                    "year": (it.get("release_date") or "0000")[:4], "poster_path": it.get("poster_path"),
                    "rating": it.get("vote_average")})
    return jsonify(ok=True, results=res)

@app.get("/api/tmdb/details")
def api_tmdb_details():
    if not require_login(): return ("",401)
    tmdb_id = request.args.get("tmdb_id")
    info = tmdb_get(f"movie/{tmdb_id}", params={"language":"pt-BR"})
    return jsonify(ok=True, data={"overview_ptbr": info.get("overview"), "overview": info.get("overview")})

# ---------- PROXY IMAGENS TMDB ----------
@app.get("/img/tmdb/<size>/<path:rel>")
def tmdb_img(size, rel):
    # ex: /img/tmdb/w342/abc.jpg
    url = f"https://image.tmdb.org/t/p/{size}/{rel}"
    r = requests.get(url, timeout=20)
    if r.status_code != 200: return ("", 404)
    return send_file(io.BytesIO(r.content), mimetype="image/jpeg", max_age=86400)

# ---------- ADMIN BACKUP/RESTORE ----------
@app.get("/api/admin/backup")
def api_backup():
    if not require_login(): return ("",401)
    with engine.begin() as conn:
        dump = {
            "users": [dict(r) for r in conn.execute(text("SELECT id,username,name,role FROM users")).mappings().all()],
            "movies": [dict(r) for r in conn.execute(text("SELECT * FROM movies")).mappings().all()],
            "ratings": [dict(r) for r in conn.execute(text("SELECT * FROM ratings")).mappings().all()],
            "watch_events": [dict(r) for r in conn.execute(text("SELECT * FROM watch_events")).mappings().all()],
        }
    return app.response_class(json.dumps(dump, ensure_ascii=False, indent=2), mimetype="application/json")

@app.post("/api/admin/restore")
def api_restore():
    if not require_login(): return ("",401)
    data = request.get_json() or {}
    with engine.begin() as conn:
        for t in ("movies","ratings","watch_events"):
            if t in data:
                # limpa e insere (somente tabelas não-sensíveis)
                conn.execute(text(f"DELETE FROM {t}"))
                for row in data[t]:
                    cols = ",".join(row.keys())
                    vals = ",".join([f":{k}" for k in row.keys()])
                    conn.execute(text(f"INSERT INTO {t}({cols}) VALUES({vals})"), row)
    return jsonify(ok=True)

# ---------- RUN ----------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)))
