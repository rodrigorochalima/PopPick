import os
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///poppic.db")
SECRET_KEY  = os.getenv("SECRET_KEY", "change-me-in-production")
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
