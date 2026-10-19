import os
import sqlite3
import psycopg2

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "database"))
os.makedirs(DB_DIR, exist_ok=True)

USER_DB_PATH = os.path.join(DB_DIR, "tlmn_user_database.db")
SAMPLE_DB_PATH = os.path.join(DB_DIR, "tlmn_sample_database.db")

DATABASE_URL = os.environ.get("DATABASE_URL")


def get_db_connection():
    """Tự động kết nối PostgreSQL nếu có DATABASE_URL, ngược lại dùng SQLite."""
    if DATABASE_URL:
        conn = psycopg2.connect(DATABASE_URL)
        return conn, True
    else:
        conn = sqlite3.connect(USER_DB_PATH)
        return conn, False


def execute_query(cursor, query: str, params=()):
    """Tự động chuyển dấu '?' thành '%s' nếu đang chạy PostgreSQL."""
    if DATABASE_URL:
        # Thay thế dấu '?' thành '%s' cho PostgreSQL
        query = query.replace("?", "%s")
    cursor.execute(query, params)
