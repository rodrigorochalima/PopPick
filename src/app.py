import os, json, datetime
from flask import Flask, request, jsonify, render_template, redirect, url_for, session, send_file
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from src.config import DATABASE_URL, SECRET_KEY, TMDB_API_KEY
import requests
from io import BytesIO

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)
app.secret_key = SECRET_KEY

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, future=True)

def init_db():
    with engine.begin() as conn:
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL
        );
        """))
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
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS view_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          movie_id INTEGER,
          watched_at TEXT,
          FOREIGN KEY(movie_id) REFERENCES movies(id)
        );
        """))
        user = conn.execute(text("SELECT id FROM users WHERE username='rodrigo'")).fetchone()
        if not user:
            conn.execute(text("""
              INSERT INTO users (username, name, password_hash)
              VALUES ('rodrigo','Rodrigo Rocha Lima','bd6523840ddb736ee5df08c6977c5da5')
            """))
        nemo = conn.execute(text("SELECT id FROM movies WHERE slug='procurando-nemo-2003'")).fetchone()
        if not nemo:
            conn.execute(text("""
              INSERT INTO movies (slug,title,year,studio,tmdb_id,watched,views,rating)
              VALUES ('procurando-nemo-2003','Procurando Nemo',2003,'disney',12,1,4,9)
            """))
        ap11 = conn.execute(text("SELECT id FROM movies WHERE slug='apollo-11-2019'")).fetchone()
        if not ap11:
            conn.execute(text("""
              INSERT INTO movies (slug,title,year,studio,tmdb_id,watched,views,rating)
              VALUES ('apollo-11-2019','Apollo 11',2019,'nasa',504172,0,0,NULL)
            """))
        jp = conn.execute(text("SELECT id FROM movies WHERE slug='jurassic-park-1993'")).fetchone()
        if not jp:
            conn.execute(text("""
              INSERT INTO movies (slug,title,year,studio,tmdb_id,watched,views,rating)
              VALUES ('jurassic-park-1993','Jurassic Park',1993,'universal',329,0,0,NULL)
            """))

init_db()

@app.post("/api/auth/login")
def api_login():
    data = request.get_json(force=True)
    u = (data.get("username") or "").strip()
    p = (data.get("password") or "").strip()
    with engine.begin() as conn:
        row = conn.execute(text("SELECT id,name,password_hash FROM users WHERE username=:u"), {"u":u}).fetchone()
        if not row:
            return jsonify({"ok":False,"error":"Usuário ou senha inválidos"}), 401
        import hashlib
        if hashlib.sha256(p.encode()).hexdigest() != row.password_hash:
            return jsonify({"ok":False,"error":"Usuário ou senha inválidos"}), 401
        session["user"] = {"id":row.id, "name":row.name, "username":u}
        return jsonify({"ok":True,"user":session["user"]})

@app.post("/api/auth/logout")
def api_logout():
    session.clear()
    return jsonify({"ok":True})

@app.get("/api/movies")
def api_movies():
    q = (request.args.get("q") or "").lower()
    f = (request.args.get("filter") or "todos")
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT * FROM movies ORDER BY title ASC")).mappings().all()
        items = []
        for r in rows:
            if f != "todos" and r["studio"] != f: 
                continue
            if q and (q not in r["title"].lower()):
                continue
            items.append(dict(r))
        return jsonify({"ok":True, "items":items})

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
    return jsonify({"ok":True})

def re_slug(s:str)->str:
    import re
    return re.sub(r'[^a-z0-9]+','-', s.lower()).strip('-')

@app.post("/api/movies/<int:movie_id>/toggle_watch")
def api_toggle_watch(movie_id):
    with engine.begin() as conn:
        r = conn.execute(text("SELECT watched,views FROM movies WHERE id=:id"),{"id":movie_id}).fetchone()
        if not r: return jsonify({"ok":False}),404
        watched = 0 if r.watched else 1
        views = r.views + 1 if watched else max(0, r.views-1)
        conn.execute(text("UPDATE movies SET watched=:w, views=:v WHERE id=:id"),
                     {"w":watched,"v":views,"id":movie_id})
        if watched:
            conn.execute(text("INSERT INTO view_history (movie_id,watched_at) VALUES (:id,:dt)"),
                         {"id":movie_id,"dt":datetime.datetime.utcnow().isoformat()})
    return jsonify({"ok":True})

@app.post("/api/movies/<int:movie_id>/rate")
def api_rate(movie_id):
    data = request.get_json(force=True)
    rating = int(data.get("rating") or 0)
    with engine.begin() as conn:
        r = conn.execute(text("SELECT watched FROM movies WHERE id=:id"),{"id":movie_id}).fetchone()
        if not r: return jsonify({"ok":False}),404
        if not r.watched:
            return jsonify({"ok":False,"error":"Avaliação só após assistir"}), 400
        conn.execute(text("UPDATE movies SET rating=:rt WHERE id=:id"),{"rt":rating,"id":movie_id})
    return jsonify({"ok":True})

@app.get("/api/tmdb/poster/<int:tmdb_id>")
def api_tmdb_poster(tmdb_id):
    if not TMDB_API_KEY:
        return jsonify({"ok":False,"error":"TMDB_API_KEY não configurada"}), 400
    r = requests.get(f"https://api.themoviedb.org/3/movie/{tmdb_id}",
                     params={"api_key":TMDB_API_KEY, "language":"pt-BR"})
    if r.status_code != 200:
        return jsonify({"ok":False,"error":"TMDB erro"}), 502
    data = r.json()
    path = data.get("poster_path")
    if not path:
        return jsonify({"ok":True,"url":None})
    return jsonify({"ok":True,"url":"https://image.tmdb.org/t/p/w342"+path})

@app.get("/api/admin/backup")
def api_backup():
    with engine.begin() as conn:
        movies = [dict(x) for x in conn.execute(text("SELECT * FROM movies")).mappings().all()]
        views = [dict(x) for x in conn.execute(text("SELECT * FROM view_history")).mappings().all()]
    payload = json.dumps({"movies":movies,"view_history":views}, ensure_ascii=False, indent=2)
    return send_file(BytesIO(payload.encode("utf-8")), mimetype="application/json", as_attachment=True, download_name="poppic_backup.json")

@app.post("/api/admin/restore")
def api_restore():
    payload = request.get_json(force=True, silent=True)
    if not payload: return jsonify({"ok":False,"error":"JSON inválido"}), 400
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
    return jsonify({"ok":True})

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
