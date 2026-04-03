"""
Ví dụ sử dụng captcha_solver
"""

import json
import sys
import os

# Thêm thư mục cha vào path nếu chạy từ example/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from captcha_solver import solve_slider_captcha, solve_from_bytes

BASE = os.path.join(os.path.dirname(__file__), "..")

# ─── Ví dụ 1: Dùng đường dẫn file ────────────────────────────────────────────
import glob

jpegs = glob.glob(os.path.join(BASE, "*.jpeg")) + glob.glob(os.path.join(BASE, "*.jpg"))
pngs  = glob.glob(os.path.join(BASE, "*.png"))

if jpegs and pngs:
    bg_path    = jpegs[0]
    piece_path = pngs[0]

    print("=== Ví dụ 1: solve_slider_captcha (file path) ===")
    result = solve_slider_captcha(bg_path, piece_path)
    print(json.dumps({"slideXProportion": result["slideXProportion"]}, indent=2))
    print("Debug info:", result["_debug"])
    print()

    # ─── Ví dụ 2: Dùng bytes (HTTP response) ─────────────────────────────────
    print("=== Ví dụ 2: solve_from_bytes ===")
    with open(bg_path, "rb") as f:
        bg_bytes = f.read()
    with open(piece_path, "rb") as f:
        piece_bytes = f.read()

    result2 = solve_from_bytes(bg_bytes, piece_bytes)
    print(json.dumps({"slideXProportion": result2["slideXProportion"]}, indent=2))
    print()

    # ─── Ví dụ 3: Tích hợp với HTTP request (httpx / requests) ──────────────
    print("=== Ví dụ 3: pattern tích hợp API ===")
    print("""
# import httpx
# from captcha_solver import solve_from_bytes
#
# bg_bytes    = httpx.get(captcha_data["bgUrl"]).content
# piece_bytes = httpx.get(captcha_data["pieceUrl"]).content
#
# result = solve_from_bytes(bg_bytes, piece_bytes)
# slide_x = result["slideXProportion"]   # → 0.337...
# payload = {"slideXProportion": slide_x}
""")

else:
    print("Không tìm thấy ảnh mẫu. Đặt file .jpeg và .png vào thư mục gốc.")
