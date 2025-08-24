import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///poppic.db")
SECRET_KEY   = os.getenv("SECRET_KEY", "change-me-in-production")
TMDB_API_KEY = os.getenv("TMDB_API_KEY")

# 🔹 Novos: credenciais iniciais (bootstrap)
ADMIN_USER = os.getenv("ADMIN_USER", "rodrigo")
ADMIN_PASS = os.getenv("ADMIN_PASS", "530431")
