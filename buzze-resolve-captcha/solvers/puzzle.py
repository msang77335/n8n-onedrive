"""
Puzzle Slider Captcha Solver
Kéo mảnh ghép vào đúng vị trí trên ảnh nền.

Trả về: {"slideXProportion": float}
"""

import cv2
import numpy as np

from solvers.base import BaseSolver


class PuzzleSolver(BaseSolver):

    def solve(self, puzzle_bytes: bytes, piece_bytes: bytes) -> dict:
        bg_arr    = np.frombuffer(puzzle_bytes, dtype=np.uint8)
        piece_arr = np.frombuffer(piece_bytes,  dtype=np.uint8)

        bg_img    = cv2.imdecode(bg_arr,    cv2.IMREAD_COLOR)
        piece_img = cv2.imdecode(piece_arr, cv2.IMREAD_UNCHANGED)

        if bg_img is None:
            raise ValueError("Không giải mã được puzzleImage")
        if piece_img is None:
            raise ValueError("Không giải mã được pieceImage")

        bg_h, bg_w       = bg_img.shape[:2]
        piece_h, piece_w = piece_img.shape[:2]

        # ── Mask từ alpha channel ────────────────────────────────────────────
        if piece_img.ndim == 3 and piece_img.shape[2] == 4:
            alpha      = piece_img[:, :, 3]
            piece_mask = (alpha > 10).astype(np.uint8) * 255
        else:
            piece_mask = np.ones((piece_h, piece_w), dtype=np.uint8) * 255

        # ── Canny edge detection ─────────────────────────────────────────────
        bg_gray    = cv2.cvtColor(bg_img, cv2.COLOR_BGR2GRAY)
        piece_gray = cv2.cvtColor(piece_img[:, :, :3], cv2.COLOR_BGR2GRAY)

        bg_edges    = cv2.Canny(cv2.GaussianBlur(bg_gray,    (3, 3), 0), 50, 150)
        piece_edges = cv2.Canny(cv2.GaussianBlur(piece_gray, (3, 3), 0), 50, 150)
        piece_edges = cv2.bitwise_and(piece_edges, piece_edges, mask=piece_mask)

        # ── Template matching ─────────────────────────────────────────────────
        match  = cv2.matchTemplate(bg_edges, piece_edges, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(match)
        best_x, best_y = max_loc

        return {
            "slideXProportion": best_x / bg_w,
            "_debug": {
                "best_x":      best_x,
                "best_y":      best_y,
                "match_score": float(round(max_val, 4)),
                "bg_size":     (bg_w, bg_h),
                "piece_size":  (piece_w, piece_h),
            },
        }
