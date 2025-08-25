import os, json, base64, io, datetime as dt
from flask import Flask, request, jsonify, render_template, redirect, session, send_file
from flask_cors import CORS
from sqlalchemy import create_engine, text
import requests

# Import compatível com execução local e no Render
try:
    from .config import DATABASE_URL, SECRET_KEY, TMDB_API_KEY
except ImportError:
    from config import DATABASE_URL, SECRET_KEY, TMDB_API_KEY


# ----------------------------------------------------------------------------
# APP / DB CONFIG
# ----------------------------------------------------------------------------
app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)
app.secret_key = SECRET_KEY

engine = create_engine(DATABASE_URL, future=True)


# ----------------------------------------------------------------------------
# INIT DB
# ----------------------------------------------------------------------------
def init_db():
    with engine.begin() as conn:
        # Usuários
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            secret_question TEXT,
            secret_answer TEXT,
            avatar BLOB
        )
        """))

        # Filmes
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS movies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tmdb_id INTEGER,
            title TEXT,
            year INTEGER,
            studio TEXT,
            poster TEXT,
            avg_rating REAL DEFAULT 0
        )
        """))

        # Notas / histórico de visualização
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            movie_id INTEGER,
            rating INTEGER,
            watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(movie_id) REFERENCES movies(id)
        )
        """))

    print("Banco inicializado com sucesso.")


# ----------------------------------------------------------------------------
# ROTAS BÁSICAS
# ----------------------------------------------------------------------------
@app.route("/")
def index():
    if "user_id" not in session:
        return redirect("/login")
    return render_template("app.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        data = request.json
        username = data.get("username")
        password = data.get("password")
        with engine.begin() as conn:
            user = conn.execute(
                text("SELECT id, password_hash FROM users WHERE username = :u"),
                {"u": username}
            ).fetchone()
            if user and user.password_hash == password:
                session["user_id"] = user.id
                return jsonify({"success": True})
        return jsonify({"success": False, "error": "Usuário ou senha inválidos"})
    return render_template("index.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")


# ----------------------------------------------------------------------------
# TMDB INTEGRAÇÃO
# ----------------------------------------------------------------------------
TMDB_BASE = "https://api.themoviedb.org/3"

def tmdb_search(query):
    r = requests.get(
        f"{TMDB_BASE}/search/movie",
        params={"api_key": TMDB_API_KEY, "language": "pt-BR", "query": query}
    )
    return r.json().get("results", [])


@app.route("/api/search_tmdb")
def search_tmdb():
    q = request.args.get("q", "")
    return jsonify(tmdb_search(q))


# ----------------------------------------------------------------------------
# START
# ----------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000)
