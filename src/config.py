import os

# Banco padrão: SQLite em arquivo. (Quando migrar para Postgres, defina DATABASE_URL no Render.)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///poppic.db")

# Chave secreta do Flask (defina no Render depois).
SECRET_KEY   = os.getenv("SECRET_KEY", "change-me-in-production")

# TMDB opcional para pôsteres
TMDB_API_KEY = os.getenv("TMDB_API_KEY")

# 🔹 Credenciais iniciais (bootstrap do primeiro admin)
ADMIN_USER = os.getenv("ADMIN_USER", "rodrigo")
ADMIN_PASS = os.getenv("ADMIN_PASS", "530431")
