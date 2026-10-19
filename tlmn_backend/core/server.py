from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import random
import time
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import traceback
from db_helper import get_db_connection, execute_query
from app_controller import TLMNRoomManager

# --- Mã nhà phát triển ---
# Nhập ở ô "Mã quà tặng" trong menu chính. CHỈ tài khoản DEV_USERNAME mới nhận được chip; người khác nhập sẽ bị báo
# "không hợp lệ" y hệt một mã không tồn tại. Mã này KHÔNG nằm trong bảng promo_codes (không ai "phát hành" được).
# Nhập mã -> số dư được nâng lên DEV_BALANCE (giữ đúng mức 10 nghìn tỷ bạn đang dùng ở bản cũ; dùng lại được nhiều lần).
DEV_CODE = "KHOAZ17TLMN"
DEV_USERNAME = "KhoaZ"
DEV_BALANCE = 10000000000000.0
INVALID_CODE_MESSAGE = "Mã đổi thưởng không hợp lệ hoặc không tồn tại!"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "tlmn_frontend", "dist"))

app = FastAPI(title="TLMN Multi-Room Card Game API")


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
    # DÙNG DB_HELPER ĐỂ KẾT NỐI (Tạo 4 bảng trong 1 Database)
    conn, is_postgres = get_db_connection()
    cursor = conn.cursor()

    if is_postgres:
        # PostgreSQL (Supabase)
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS accounts (
                player_id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                balance DOUBLE PRECISION DEFAULT 500000.0,
                highest_balance DOUBLE PRECISION DEFAULT 500000.0,
                display_name TEXT,
                gender TEXT DEFAULT 'Nam',
                avatar TEXT,
                games_played_cc INTEGER DEFAULT 0,
                games_won_cc INTEGER DEFAULT 0,
                games_played_wta INTEGER DEFAULT 0,
                games_won_wta INTEGER DEFAULT 0,
                last_daily_date TEXT,
                created_ip TEXT,
                created_at TEXT
            )
        ''')
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS promo_codes (
                code TEXT PRIMARY KEY,
                reward_amount DOUBLE PRECISION NOT NULL,
                uses_left INTEGER DEFAULT 100
            )
        ''')
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS user_redeemed_codes (
                username TEXT,
                code TEXT,
                PRIMARY KEY (username, code)
            )
        ''')
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS match_training_data (
                id SERIAL PRIMARY KEY,
                room_id TEXT,
                match_id INTEGER,
                timestamp TEXT,
                config TEXT,
                match_json TEXT
            )
        ''')
    else:
        # SQLite
        execute_query(cursor, '''
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
                last_daily_date TEXT,
                created_ip TEXT,
                created_at TEXT
            )
        ''')
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS promo_codes (
                code TEXT PRIMARY KEY,
                reward_amount REAL NOT NULL,
                uses_left INTEGER DEFAULT 100
            )
        ''')
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS user_redeemed_codes (
                username TEXT,
                code TEXT,
                PRIMARY KEY (username, code)
            )
        ''')
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS match_training_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id TEXT,
                match_id INTEGER,
                timestamp TEXT,
                config TEXT,
                match_json TEXT
            )
        ''')

    # Bản server cũ từng tự chèn mã nhà phát triển vào promo_codes như một mã công khai: xoá hàng đó nếu còn sót trong DB.
    execute_query(cursor, "DELETE FROM promo_codes WHERE UPPER(code) = ?", (DEV_CODE,))

    conn.commit()
    conn.close()


init_databases()
room_manager = TLMNRoomManager()

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")


    @app.get("/")
    async def serve_frontend():
        # QUAN TRỌNG: index.html KHÔNG được cache — nếu trình duyệt (đặc biệt
        # trên điện thoại) giữ bản index.html cũ sau khi bạn `npm run build`
        # lại, mọi sửa đổi JS/CSS mới sẽ KHÔNG BAO GIỜ được tải, dù file thật
        # trên server đã đúng. Các file trong /assets/ (JS/CSS đã băm tên) thì
        # an toàn để cache dài hạn vì tên file đổi mỗi lần build.
        return FileResponse(
            os.path.join(FRONTEND_DIST, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
else:
    print(f"[server] Không thấy bản build Frontend tại: {FRONTEND_DIST}")
    print("[server] Bỏ qua phục vụ static file — server chỉ chạy API thuần.")
    print("[server] Đang code? Chạy `npm run dev` ở thư mục frontend (một terminal khác) là đủ.")
    print("[server] Muốn dùng 1 server duy nhất: vào thư mục frontend, chạy `npm run build`,")
    print("[server] và đảm bảo tên thư mục khớp với FRONTEND_DIST ở trên.")


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UpdateProfileRequest(BaseModel):
    username: str
    display_name: Optional[str] = None
    gender: Optional[str] = None
    avatar: Optional[str] = None


class RedeemRequest(BaseModel):
    username: str
    code: str


class JoinRequest(BaseModel):
    room_id: str
    username: str


class SetupRequest(BaseModel):
    room_id: Optional[str] = None
    joker_mode: bool
    payment_mode: str
    num_bots: int
    num_humans: Optional[int] = 1
    cost: Optional[int] = None
    player_accounts: Optional[List[str]] = []


class ActionRequest(BaseModel):
    room_id: Optional[str] = "default"
    player_id: int
    cards_to_play: List[str]
    chosen_option_index: Optional[int] = None


@app.post("/api/auth/register")
def register_account(req: RegisterRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    conn, _ = get_db_connection()
    cursor = conn.cursor()

    execute_query(cursor, "SELECT COUNT(*) FROM accounts WHERE created_ip = ?", (client_ip,))
    if cursor.fetchone()[0] >= 3:
        conn.close()
        return {"status": "error", "message": "Địa chỉ IP của bạn đã tạo tối đa 3 tài khoản!"}

    execute_query(cursor, "SELECT username FROM accounts WHERE username = ?", (req.username,))
    if cursor.fetchone():
        conn.close()
        return {"status": "error", "message": "Tên tài khoản này đã tồn tại."}

    while True:
        player_id = str(random.randint(1000000000, 9999999999))
        execute_query(cursor, "SELECT player_id FROM accounts WHERE player_id = ?", (player_id,))
        if not cursor.fetchone():
            break

    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    initial_balance = 500000.0

    execute_query(cursor, '''
        INSERT INTO accounts (player_id, username, password, balance, highest_balance, display_name, gender, created_ip, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        player_id, req.username, req.password, initial_balance, initial_balance, req.username, 'Nam', client_ip,
        timestamp))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Đăng ký thành công nhận 500k!", "player_id": player_id,
            "balance": initial_balance}


@app.post("/api/auth/login")
def login_account(req: LoginRequest):
    conn, _ = get_db_connection()
    cursor = conn.cursor()

    execute_query(cursor,
                  "SELECT player_id, password, balance, highest_balance, display_name, gender, avatar, games_played_cc, games_won_cc, games_played_wta, games_won_wta, last_daily_date FROM accounts WHERE username = ?",
                  (req.username,)
                  )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"status": "error", "message": "Tài khoản không tồn tại!"}

    player_id, db_password, balance, highest_balance, display_name, gender, avatar, gp_cc, gw_cc, gp_wta, gw_wta, last_daily_date = row
    if db_password != req.password:
        conn.close()
        return {"status": "error", "message": "Mật khẩu không chính xác!"}

    today_str = time.strftime("%Y-%m-%d")
    if balance <= 0 and last_daily_date != today_str:
        balance += 50000.0
        highest_balance = max(highest_balance, balance)
        execute_query(cursor,
                      "UPDATE accounts SET balance = ?, highest_balance = ?, last_daily_date = ? WHERE username = ?",
                      (balance, highest_balance, today_str, req.username))
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
    conn, _ = get_db_connection()
    cursor = conn.cursor()
    execute_query(cursor, "SELECT username FROM accounts WHERE username = ?", (req.username,))
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
        # Vì phần này sinh SQL động, ta vẫn dùng hàm helper để nó đổi '?' sang '%s' nếu cần
        query = f"UPDATE accounts SET {', '.join(fields)} WHERE username = ?"
        execute_query(cursor, query, values)
        conn.commit()
    conn.close()
    return {"status": "success", "message": "Cập nhật hồ sơ thành công!"}


@app.post("/api/auth/redeem")
def redeem_promo_code(req: RedeemRequest):
    conn, _ = get_db_connection()
    cursor = conn.cursor()
    execute_query(cursor, "SELECT balance FROM accounts WHERE username = ?", (req.username,))
    acc_row = cursor.fetchone()
    if not acc_row:
        conn.close()
        return {"status": "error", "message": "Tài khoản không tồn tại!"}

    current_balance = acc_row[0]
    clean_code = req.code.strip().upper()

    # Mã nhà phát triển: chỉ DEV_USERNAME dùng được (dùng lại được nhiều lần, không ghi vào user_redeemed_codes).
    # Người khác nhập -> lỗi giống hệt mã không tồn tại, để không lộ rằng mã này có thật.
    if clean_code == DEV_CODE:
        if req.username != DEV_USERNAME:
            conn.close()
            return {"status": "error", "message": INVALID_CODE_MESSAGE}
        new_balance = max(current_balance, DEV_BALANCE)  # chỉ nâng lên, không bao giờ làm số dư tụt xuống
        gained = new_balance - current_balance
        execute_query(cursor,
                      "UPDATE accounts SET balance = ?, highest_balance = CASE WHEN ? > highest_balance THEN ? ELSE highest_balance END WHERE username = ?",
                      (new_balance, new_balance, new_balance, req.username))
        conn.commit()
        conn.close()
        message = (f"Đổi thưởng thành công nhận {gained:,.0f} Chip!" if gained > 0
                   else "Số dư của bạn đã ở mức tối đa của nhà phát triển.")
        return {"status": "success", "message": message, "new_balance": new_balance}

    execute_query(cursor, "SELECT reward_amount, uses_left FROM promo_codes WHERE code = ?", (clean_code,))
    code_row = cursor.fetchone()
    if not code_row:
        conn.close()
        return {"status": "error", "message": INVALID_CODE_MESSAGE}

    reward_amount, uses_left = code_row
    if uses_left <= 0:
        conn.close()
        return {"status": "error", "message": "Mã đổi thưởng đã hết lượt sử dụng!"}

    execute_query(cursor, "SELECT * FROM user_redeemed_codes WHERE username = ? AND code = ?",
                  (req.username, clean_code))
    if cursor.fetchone():
        conn.close()
        return {"status": "error", "message": "Bạn đã sử dụng mã này rồi!"}

    new_balance = current_balance + reward_amount
    # Cập nhật số dư và cao nhất
    execute_query(cursor,
                  "UPDATE accounts SET balance = ?, highest_balance = CASE WHEN ? > highest_balance THEN ? ELSE highest_balance END WHERE username = ?",
                  (new_balance, new_balance, new_balance, req.username))
    execute_query(cursor, "UPDATE promo_codes SET uses_left = uses_left - 1 WHERE code = ?", (clean_code,))
    execute_query(cursor, "INSERT INTO user_redeemed_codes (username, code) VALUES (?, ?)", (req.username, clean_code))
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"Đổi thưởng thành công nhận {reward_amount:,.0f} Chip!",
            "new_balance": new_balance}


@app.get("/api/rooms")
def list_active_rooms():
    return {"status": "success", "rooms": room_manager.list_rooms()}


@app.post("/api/setup")
def setup_game(req: SetupRequest):
    """Thiết lập thông số cho bàn chơi (Tạo phòng chơi mới hoặc setup lại phòng hiện tại).

    `player_accounts` = tài khoản của những người thật ĐÃ CÓ MẶT (phần tử đầu là chủ phòng). Nếu `num_humans` lớn hơn
    số tài khoản đưa vào thì phần còn lại là GHẾ TRỐNG (`open_seats` trong kết quả): phòng chờ người khác nhập mã phòng
    (POST /api/join). Chủ phòng bấm bắt đầu (POST /api/start) thì ghế còn trống do Bot ngồi vào."""
    room_id = req.room_id if (req.room_id and req.room_id.strip()) else "".join(random.choices("0123456789", k=8))
    controller = room_manager.get_room(room_id)
    return controller.setup_game(
        joker_mode=req.joker_mode,
        payment_mode=req.payment_mode,
        num_bots=req.num_bots,
        num_humans=req.num_humans if req.num_humans else 1,
        cost=req.cost,
        player_accounts=req.player_accounts
    )


@app.post("/api/join")
def join_room(req: JoinRequest):
    """Nhập mã phòng để ngồi vào một ghế người thật còn trống.
    Chỉ vào được khi phòng đang chờ (chưa chia ván đầu); phòng đang trong ván thì báo lỗi `in_progress`.
    Thành công trả về `seat` (số ghế của bạn = player_id khi gọi /api/state, /api/action...) và ảnh chụp phòng chờ."""
    room = room_manager.find_room((req.room_id or "").strip())
    if room is None:
        return {"status": "error", "code": "not_found",
                "message": "Không tìm thấy phòng này. Hãy kiểm tra lại mã phòng."}
    return room.join_room(req.username)


@app.get("/api/lobby")
def get_lobby(room_id: Optional[str] = "default", player_id: Optional[int] = None, username: Optional[str] = None):
    """Phòng chờ: ghế nào ai ngồi (người thật / Bot / trống), cấu hình phòng và `started` (ván đầu đã chia chưa).
    Truyền `player_id` (+ `username`) để "điểm danh" là bạn còn ở phòng; `started` = true thì chuyển sang GET /api/state."""
    room = room_manager.find_room((room_id or "").strip())
    if room is None:
        return {"status": "error", "code": "closed", "message": "Phòng đã đóng hoặc không tồn tại."}
    return room.get_lobby(player_id=player_id, username=username)


@app.post("/api/start")
def start_game(room_id: Optional[str] = "default", player_id: Optional[int] = None):
    """Phát bài và bắt đầu ván mới.
    Ván ĐẦU TIÊN: chỉ chủ phòng được bắt đầu (truyền `player_id` = ghế chủ phòng; ghế người thật còn trống do Bot ngồi vào).
    Các ván sau tự bắt đầu sau đếm ngược, không ai có đặc quyền. Đang có ván chạy thì báo lỗi, không chia đè."""
    return room_manager.get_room(room_id).start_new_match(player_id=player_id)


@app.post("/api/intro_done")
def intro_done(room_id: Optional[str] = "default"):
    """Báo hiệu Frontend đã chạy xong animation chia/xếp bài, chính thức bắt đầu tính giờ lượt chơi."""
    return room_manager.get_room(room_id).intro_done()


@app.get("/api/state")
def get_state(room_id: Optional[str] = "default", player_id: int = 0):
    """
    Lấy dữ liệu của bàn chơi hiện tại.
    Hàm này tự động kiểm tra Timer. Nếu ai đó hết giờ, Backend sẽ tự can thiệp ép đánh/bỏ lượt.
    """
    return room_manager.get_room(room_id).get_game_state(player_id=player_id)


@app.post("/api/action")
def play_action(req: ActionRequest):
    """Gửi hành động đánh bài hoặc bỏ lượt (danh sách rỗng)."""
    return room_manager.get_room(req.room_id).play_action(
        player_id=req.player_id,
        cards_to_play=req.cards_to_play,
        chosen_option_index=req.chosen_option_index
    )


@app.post("/api/bot_action")
def trigger_bot(room_id: Optional[str] = "default"):
    """Đích danh gọi Bot đánh. Hữu ích nếu Frontend muốn có delay diễn hoạt trước khi Bot ra bài."""
    return room_manager.get_room(room_id).play_bot_turn()


@app.post("/api/quit")
def quit_game(req: dict):
    """Thoát phòng: ở phòng chờ thì chủ phòng thoát = huỷ phòng, khách thoát = trả ghế; đang đấu hoặc giữa 2 ván thì
    Bot ngồi thay và ván vẫn tiếp diễn. `username` (không bắt buộc) bảo đảm không đá nhầm người đã ngồi vào ghế đó."""
    room_id = req.get("room_id", "default")
    player_id = req.get("player_id")
    username = req.get("username")
    return room_manager.get_room(room_id).handle_player_quit(player_id, username)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
