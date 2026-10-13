from fastapi import FastAPI, Request, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import sqlite3
import uuid
import random
import time
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import traceback
from app_controller import TLMNRoomManager, USER_DB_PATH, SAMPLE_DB_PATH

# 1. Lấy đường dẫn thư mục hiện tại đang chứa file code (ví dụ: .../tlmn_backend/core)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 2. Trỏ ra ngoài một cấp và đi vào thư mục database (.../tlmn_backend/database)
DB_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "database"))
os.makedirs(DB_DIR, exist_ok=True)

# 3. Định nghĩa đường dẫn chính xác cho 2 file database
USER_DB_PATH = os.path.join(DB_DIR, "tlmn_user_database.db")
SAMPLE_DB_PATH = os.path.join(DB_DIR, "tlmn_sample_database.db")

app = FastAPI(title="TLMN Multi-Room Card Game API with Dual Databases & 10-Digit Player ID")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": f"Lỗi máy chủ: {exc}"},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def init_databases():
    # 1. Khởi tạo cơ sở dữ liệu người chơi: tlmn_user_database.db
    conn_user = sqlite3.connect(USER_DB_PATH)
    cursor_user = conn_user.cursor()

    cursor_user.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            player_id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            balance REAL DEFAULT 500000.0,
            highest_balance REAL DEFAULT 500000.0,
            display_name TEXT,
            gender TEXT DEFAULT 'Nam',
            avatar TEXT,
            games_played_cc INTEGER DEFAULT 0,
            games_won_cc INTEGER DEFAULT 0,
            games_played_wta INTEGER DEFAULT 0,
            games_won_wta INTEGER DEFAULT 0,
            created_ip TEXT,
            created_at TEXT
        )
    ''')

    # Quản lý mã đổi thưởng (Giftcode)
    cursor_user.execute('''
        CREATE TABLE IF NOT EXISTS promo_codes (
            code TEXT PRIMARY KEY,
            reward_amount REAL NOT NULL,
            uses_left INTEGER DEFAULT 100
        )
    ''')
    cursor_user.execute('''
        CREATE TABLE IF NOT EXISTS user_redeemed_codes (
            username TEXT,
            code TEXT,
            PRIMARY KEY (username, code)
        )
    ''')

    # Tạo sẵn mã mặc định cho nhà phát triển
    cursor_user.execute("SELECT COUNT(*) FROM promo_codes WHERE code = ?", ("KHOAZ17TLMN",))
    if cursor_user.fetchone()[0] == 0:
        cursor_user.execute("INSERT INTO promo_codes (code, reward_amount, uses_left) VALUES (?, ?, ?)",
                            ("KHOAZ17TLMN", 500000.0, 1000))

    conn_user.commit()
    conn_user.close()

    # 2. Khởi tạo cơ sở dữ liệu mẫu cho Bot học: tlmn_sample_database.db
    conn_sample = sqlite3.connect(SAMPLE_DB_PATH)
    cursor_sample = conn_sample.cursor()
    cursor_sample.execute('''
        CREATE TABLE IF NOT EXISTS match_training_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT,
            match_id INTEGER,
            timestamp TEXT,
            config TEXT,
            match_json TEXT
        )
    ''')
    conn_sample.commit()
    conn_sample.close()


init_databases()
room_manager = TLMNRoomManager()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "tlmn_frontend", "dist"))

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")


    @app.get("/")
    async def serve_frontend():
        return FileResponse(
            os.path.join(FRONTEND_DIST, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
else:
    print(f"[server] Không thấy bản build Frontend tại: {FRONTEND_DIST}")


# --- PYDANTIC MODELS ---
class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str
    dev_code: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    username: str
    display_name: Optional[str] = None
    gender: Optional[str] = None
    avatar: Optional[str] = None


class RedeemRequest(BaseModel):
    username: str
    code: str


class SetupRequest(BaseModel):
    room_id: Optional[str] = None
    joker_mode: bool
    payment_mode: str
    num_bots: int
    num_humans: Optional[int] = 1
    cost: Optional[int] = None
    starting_balance: Optional[float] = None
    player_accounts: Optional[List[str]] = []


class ActionRequest(BaseModel):
    room_id: Optional[str] = "default"
    player_id: int
    cards_to_play: List[str]
    chosen_option_index: Optional[int] = None


# --- API AUTH & PROFILE (Lưu vào tlmn_user_database.db) ---

@app.post("/api/auth/register")
def register_account(req: RegisterRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    conn = sqlite3.connect(USER_DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM accounts WHERE created_ip = ?", (client_ip,))
    if cursor.fetchone()[0] >= 3:
        conn.close()
        return {"status": "error", "message": "Địa chỉ IP của bạn đã tạo tối đa 3 tài khoản!"}

    cursor.execute("SELECT username FROM accounts WHERE username = ?", (req.username,))
    if cursor.fetchone():
        conn.close()
        return {"status": "error", "message": "Tên tài khoản này đã tồn tại."}

    # Tạo ID 10 chữ số độc nhất (không bắt đầu bằng số 0, từ 1000000000 đến 9999999999)
    while True:
        player_id = str(random.randint(1000000000, 9999999999))
        cursor.execute("SELECT player_id FROM accounts WHERE player_id = ?", (player_id,))
        if not cursor.fetchone():
            break

    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    initial_balance = 500000.0

    cursor.execute('''
        INSERT INTO accounts (player_id, username, password, balance, highest_balance, display_name, gender, created_ip, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
    player_id, req.username, req.password, initial_balance, initial_balance, req.username, 'Nam', client_ip, timestamp))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Đăng ký thành công!", "player_id": player_id, "balance": initial_balance}


@app.post("/api/auth/login")
def login_account(req: LoginRequest):
    conn = sqlite3.connect(USER_DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        "SELECT player_id, password, balance, highest_balance, display_name, gender, avatar, games_played_cc, games_won_cc, games_played_wta, games_won_wta FROM accounts WHERE username = ?",
        (req.username,)
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"status": "error", "message": "Tài khoản không tồn tại!"}

    player_id, db_password, balance, highest_balance, display_name, gender, avatar, gp_cc, gw_cc, gp_wta, gw_wta = row
    if db_password != req.password:
        conn.close()
        return {"status": "error", "message": "Mật khẩu không chính xác!"}

    if req.dev_code and req.dev_code.strip() == "KHOAZ17TLMN":
        balance = 10000000.0
        highest_balance = max(highest_balance, balance)
        cursor.execute("UPDATE accounts SET balance = ?, highest_balance = ? WHERE username = ?",
                       (balance, highest_balance, req.username))
        conn.commit()

    conn.close()
    return {
        "status": "success",
        "message": "Đăng nhập thành công!",
        "username": req.username,
        "player_id": player_id,
        "balance": balance,
        "profile": {
            "player_id": player_id,
            "display_name": display_name or req.username,
            "gender": gender or "Nam",
            "avatar": avatar or "",
            "balance": balance,
            "highest_balance": highest_balance,
            "stats": {
                "count_cards": {"played": gp_cc, "won": gw_cc},
                "winner_takes_all": {"played": gp_wta, "won": gw_wta}
            }
        }
    }


@app.post("/api/auth/update_profile")
def update_profile(req: UpdateProfileRequest):
    conn = sqlite3.connect(USER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT username FROM accounts WHERE username = ?", (req.username,))
    if not cursor.fetchone():
        conn.close()
        return {"status": "error", "message": "Tài khoản không tồn tại."}

    fields, values = [], []
    if req.display_name is not None:
        fields.append("display_name = ?")
        values.append(req.display_name)
    if req.gender is not None:
        fields.append("gender = ?")
        values.append(req.gender)
    if req.avatar is not None:
        fields.append("avatar = ?")
        values.append(req.avatar)

    if fields:
        values.append(req.username)
        cursor.execute(f"UPDATE accounts SET {', '.join(fields)} WHERE username = ?", values)
        conn.commit()
    conn.close()
    return {"status": "success", "message": "Cập nhật hồ sơ thành công!"}


@app.post("/api/auth/redeem")
def redeem_promo_code(req: RedeemRequest):
    conn = sqlite3.connect(USER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT balance FROM accounts WHERE username = ?", (req.username,))
    acc_row = cursor.fetchone()
    if not acc_row:
        conn.close()
        return {"status": "error", "message": "Tài khoản không tồn tại!"}

    current_balance = acc_row[0]
    clean_code = req.code.strip().upper()

    cursor.execute("SELECT reward_amount, uses_left FROM promo_codes WHERE code = ?", (clean_code,))
    code_row = cursor.fetchone()
    if not code_row:
        conn.close()
        return {"status": "error", "message": "Mã đổi thưởng không hợp lệ hoặc không tồn tại!"}

    reward_amount, uses_left = code_row
    if uses_left <= 0:
        conn.close()
        return {"status": "error", "message": "Mã đổi thưởng đã hết lượt sử dụng!"}

    cursor.execute("SELECT * FROM user_redeemed_codes WHERE username = ? AND code = ?", (req.username, clean_code))
    if cursor.fetchone():
        conn.close()
        return {"status": "error", "message": "Bạn đã sử dụng mã này rồi!"}

    new_balance = current_balance + reward_amount
    cursor.execute("UPDATE accounts SET balance = ?, highest_balance = MAX(highest_balance, ?) WHERE username = ?",
                   (new_balance, new_balance, req.username))
    cursor.execute("UPDATE promo_codes SET uses_left = uses_left - 1 WHERE code = ?", (clean_code,))
    cursor.execute("INSERT INTO user_redeemed_codes (username, code) VALUES (?, ?)", (req.username, clean_code))
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"Đổi thưởng thành công nhận {reward_amount:,.0f} Chip!",
            "new_balance": new_balance}


# --- CÁC API GAME ---

@app.get("/api/rooms")
def list_active_rooms():
    return {"status": "success", "rooms": room_manager.list_rooms()}


@app.post("/api/setup")
def setup_game(req: SetupRequest):
    room_id = req.room_id if (req.room_id and req.room_id.strip()) else "".join(random.choices("0123456789", k=8))
    controller = room_manager.get_room(room_id)
    return controller.setup_game(
        joker_mode=req.joker_mode,
        payment_mode=req.payment_mode,
        num_bots=req.num_bots,
        num_humans=req.num_humans if req.num_humans else 1,
        cost=req.cost,
        starting_balance=req.starting_balance,
        player_accounts=req.player_accounts
    )


@app.post("/api/start")
def start_game(room_id: Optional[str] = "default"):
    return room_manager.get_room(room_id).start_new_match()


@app.post("/api/intro_done")
def intro_done(room_id: Optional[str] = "default"):
    return room_manager.get_room(room_id).intro_done()


@app.get("/api/state")
def get_state(room_id: Optional[str] = "default", player_id: int = 0):
    return room_manager.get_room(room_id).get_game_state(player_id=player_id)


@app.post("/api/action")
def play_action(req: ActionRequest):
    return room_manager.get_room(req.room_id).play_action(
        player_id=req.player_id,
        cards_to_play=req.cards_to_play,
        chosen_option_index=req.chosen_option_index
    )


@app.post("/api/bot_action")
def trigger_bot(room_id: Optional[str] = "default"):
    return room_manager.get_room(room_id).play_bot_turn()


@app.post("/api/quit")
def quit_game(room_id: Optional[str] = "default"):
    return room_manager.get_room(room_id).quit_game()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
