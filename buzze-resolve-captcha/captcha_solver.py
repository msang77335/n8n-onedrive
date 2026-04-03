"""
Slider Captcha Solver
Giải captcha dạng kéo mảnh ghép vào đúng vị trí.

Input:
  - bg_path   : đường dẫn ảnh nền (JPEG) – có lỗ hổng hình puzzle
  - piece_path: đường dẫn mảnh ghép (PNG, có kênh alpha)

Output:
  {
    "slideXProportion": float   # tỉ lệ X (0.0 – 1.0) = vị trí cần kéo tới
  }
"""

import cv2
import numpy as np
from typing import Optional


def solve_slider_captcha(bg_path: str, piece_path: str) -> dict:
    """
    Tìm vị trí X mà mảnh ghép cần được kéo tới trên ảnh nền.

    Args:
        bg_path   : Đường dẫn ảnh nền (có lỗ puzzle).
        piece_path: Đường dẫn mảnh ghép PNG (RGBA).

    Returns:
        {"slideXProportion": float}  — tỉ lệ X trên chiều ngang ảnh nền.
    """
    bg_img    = cv2.imread(bg_path, cv2.IMREAD_COLOR)
    piece_img = cv2.imread(piece_path, cv2.IMREAD_UNCHANGED)  # giữ kênh alpha

    if bg_img is None:
        raise FileNotFoundError(f"Không đọc được ảnh nền: {bg_path}")
    if piece_img is None:
        raise FileNotFoundError(f"Không đọc được mảnh ghép: {piece_path}")

    bg_h, bg_w = bg_img.shape[:2]
    piece_h, piece_w = piece_img.shape[:2]

    # ── Bước 1: Tạo mask từ alpha channel của mảnh ghép ──────────────────────
    if piece_img.shape[2] == 4:
        alpha = piece_img[:, :, 3]
        piece_mask = (alpha > 10).astype(np.uint8) * 255   # mask nhị phân
    else:
        piece_mask = np.ones((piece_h, piece_w), dtype=np.uint8) * 255

    # ── Bước 2: Phát hiện cạnh (Canny) trên cả 2 ảnh ────────────────────────
    bg_gray    = cv2.cvtColor(bg_img, cv2.COLOR_BGR2GRAY)
    piece_gray = cv2.cvtColor(piece_img[:, :, :3], cv2.COLOR_BGR2GRAY)

    # Làm mờ nhẹ để giảm nhiễu
    bg_blur    = cv2.GaussianBlur(bg_gray,    (3, 3), 0)
    piece_blur = cv2.GaussianBlur(piece_gray, (3, 3), 0)

    bg_edges    = cv2.Canny(bg_blur,    50, 150)
    piece_edges = cv2.Canny(piece_blur, 50, 150)

    # Che vùng ngoài mask của piece để chỉ giữ cạnh có nghĩa
    piece_edges_masked = cv2.bitwise_and(piece_edges, piece_edges, mask=piece_mask)

    # ── Bước 3: Template matching – tìm vị trí khớp tốt nhất ────────────────
    result = cv2.matchTemplate(bg_edges, piece_edges_masked, cv2.TM_CCOEFF_NORMED)

    # Tìm vị trí có score cao nhất
    _, max_val, _, max_loc = cv2.minMaxLoc(result)
    best_x, best_y = max_loc   # góc trên-trái của vùng khớp

    # ── Bước 4: Tính tỉ lệ X ─────────────────────────────────────────────────
    # slideXProportion = vị trí X của mảnh / chiều ngang ảnh nền
    slide_x_proportion = best_x / bg_w

    return {
        "slideXProportion": slide_x_proportion,
        # thông tin debug (tùy chọn)
        "_debug": {
            "best_x":       best_x,
            "best_y":       best_y,
            "match_score":  float(round(max_val, 4)),
            "bg_size":      (bg_w, bg_h),
            "piece_size":   (piece_w, piece_h),
        }
    }


def solve_from_bytes(bg_bytes: bytes, piece_bytes: bytes) -> dict:
    """
    Giống solve_slider_captcha nhưng nhận bytes thay vì đường dẫn file.
    Tiện dụng khi tải ảnh từ HTTP response.
    """
    bg_arr    = np.frombuffer(bg_bytes,    dtype=np.uint8)
    piece_arr = np.frombuffer(piece_bytes, dtype=np.uint8)

    bg_img    = cv2.imdecode(bg_arr,    cv2.IMREAD_COLOR)
    piece_img = cv2.imdecode(piece_arr, cv2.IMREAD_UNCHANGED)

    if bg_img is None or piece_img is None:
        raise ValueError("Không giải mã được ảnh từ bytes")

    # Lưu tạm ra bộ nhớ để tái dụng logic chính
    import tempfile, os

    with tempfile.NamedTemporaryFile(suffix=".jpeg", delete=False) as f_bg:
        bg_tmp = f_bg.name
        cv2.imwrite(bg_tmp, bg_img)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f_piece:
        piece_tmp = f_piece.name
        cv2.imwrite(piece_tmp, piece_img)

    try:
        return solve_slider_captcha(bg_tmp, piece_tmp)
    finally:
        os.unlink(bg_tmp)
        os.unlink(piece_tmp)


# ── Chạy trực tiếp để kiểm tra ───────────────────────────────────────────────
if __name__ == "__main__":
    import sys, json

    if len(sys.argv) == 3:
        bg    = sys.argv[1]
        piece = sys.argv[2]
    else:
        # Dùng ảnh mẫu có sẵn trong thư mục
        import glob, os
        base   = os.path.dirname(os.path.abspath(__file__))
        jpegs  = glob.glob(os.path.join(base, "*.jpeg")) + glob.glob(os.path.join(base, "*.jpg"))
        pngs   = glob.glob(os.path.join(base, "*.png"))

        if not jpegs or not pngs:
            print("Usage: python captcha_solver.py <background.jpeg> <piece.png>")
            sys.exit(1)

        bg    = jpegs[0]
        piece = pngs[0]
        print(f"Ảnh nền : {os.path.basename(bg)}")
        print(f"Mảnh    : {os.path.basename(piece)}")

    result = solve_slider_captcha(bg, piece)
    print(json.dumps(result, indent=2, ensure_ascii=False))
