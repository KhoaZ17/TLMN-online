from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import traceback
from app_controller import TLMNAppController

app = FastAPI(title="TLMN Card Game API")


# LƯỚI AN TOÀN: mọi exception chưa bắt sẽ được in đầy đủ traceback ra console
# server (để bạn thấy nguyên nhân gốc) và trả về JSON {"status":"error"} —
# thay vì trang lỗi HTTP 500 dạng HTML/text khiến Frontend báo "dữ liệu
# không hợp lệ".
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

# turn_time_limit = 30s để khớp với đồng hồ đếm ngược 30s trên UI.
controller = TLMNAppController(turn_time_limit=30)

# --- Phục vụ bản build tĩnh của Frontend (tuỳ chọn, 1-server) -----------------
# BASE_DIR = thư mục chứa server.py. Đường dẫn dưới đây giả định cấu trúc:
#   Gamble/
#     TLMN/tlmn_backend/server.py   <- BASE_DIR
#     tlmn_frontend/dist/           <- FRONTEND_DIST (sau khi `npm run build`)
# Nếu bạn đặt frontend ở chỗ khác (vd. đổi tên thư mục), sửa dòng
# FRONTEND_DIST bên dưới cho khớp.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "tlmn_frontend", "dist"))

# QUAN TRỌNG: chỉ mount static file khi thư mục dist THỰC SỰ tồn tại. Trước
# đây StaticFiles(...) sẽ ném lỗi và làm crash toàn bộ server ngay khi khởi
# động nếu chưa `npm run build` — tức là chặn luôn cả chế độ dev (chạy
# `npm run dev` ở một terminal khác, chỉ dùng server.py làm API thuần).
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


class SetupRequest(BaseModel):
    joker_mode: bool
    payment_mode: str
    num_bots: int
    cost: Optional[int] = None
    starting_balance: Optional[float] = None


class ActionRequest(BaseModel):
    player_id: int
    cards_to_play: List[str]
    chosen_option_index: Optional[int] = None


@app.post("/api/setup")
def setup_game(req: SetupRequest):
    """Thiết lập thông số cho bàn chơi."""
    result = controller.setup_game(
        joker_mode=req.joker_mode,
        payment_mode=req.payment_mode,
        num_bots=req.num_bots,
        cost=req.cost,
        starting_balance=req.starting_balance
    )
    return result


@app.post("/api/start")
def start_game():
    """Phát bài và bắt đầu vòng chơi mới."""
    return controller.start_new_match()


@app.post("/api/intro_done")
def intro_done():
    """Báo hiệu Frontend đã chạy xong animation chia/xếp bài, chính thức bắt đầu tính giờ lượt chơi."""
    return controller.intro_done()


@app.get("/api/state")
def get_state():
    """
    Lấy dữ liệu của bàn chơi hiện tại.
    Hàm này tự động kiểm tra Timer. Nếu ai đó hết giờ, Backend sẽ tự can thiệp ép đánh/bỏ lượt.
    """
    return controller.get_game_state(player_id=0)


@app.post("/api/action")
def play_action(req: ActionRequest):
    """Gửi hành động đánh bài hoặc bỏ lượt (danh sách rỗng)."""
    return controller.play_action(
        player_id=req.player_id,
        cards_to_play=req.cards_to_play,
        chosen_option_index=req.chosen_option_index
    )


@app.post("/api/bot_action")
def trigger_bot():
    """Đích danh gọi Bot đánh. Hữu ích nếu Frontend muốn có delay diễn hoạt trước khi Bot ra bài."""
    return controller.play_bot_turn()


@app.post("/api/quit")
def quit_game():
    """Thoát bàn và reset toàn bộ session."""
    return controller.quit_game()


if __name__ == "__main__":
    # host="0.0.0.0": lắng nghe trên mọi card mạng, để điện thoại/máy khác
    # cùng WiFi truy cập được qua địa chỉ IP LAN của máy này (vd 192.168.x.x),
    # không chỉ riêng máy đang chạy server (127.0.0.1/localhost).
    uvicorn.run(app, host="0.0.0.0", port=8000)
