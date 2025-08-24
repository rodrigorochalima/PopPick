import os

# Banco padrão: SQLite em arquivo (persistente enquanto a instância estiver ativa).
# Quando migrar para Postgres, defina DATABASE_URL no Render (e não precisa mudar o código).
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///poppic.db")

# Chave secreta do Flask (crie uma no Render depois).
SECRET_KEY   = os.getenv("SECRET_KEY", "change-me-in-production")

# TMDB opcional para pôsteres
TMDB_API_KEY = os.getenv("TMDB_API_KEY")

# 🔹 Credenciais iniciais (bootstrap do primeiro admin se o banco estiver vazio)
ADMIN_USER = os.getenv("ADMIN_USER", "rodrigo")
ADMIN_PASS = os.getenv("ADMIN_PASS", "530431")
