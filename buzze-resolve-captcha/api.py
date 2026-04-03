"""
REST API – Captcha Solver (multi-type)

POST /solve/{captcha_type}

Supported types:
  - puzzle  : kéo mảnh ghép vào đúng vị trí

Body (JSON):
{
  "puzzleImageB64": "<base64 ảnh nền>",
  "pieceImageB64":  "<base64 mảnh phụ>"
}

Response: phụ thuộc loại captcha, ví dụ puzzle trả về:
{
  "slideXProportion": 0.336...
}
"""

import base64
import sys
from fastapi import FastAPI, HTTPException, Path
from pydantic import BaseModel, field_validator

from solvers import REGISTRY, get_solver

app = FastAPI(title="Captcha Solver API", version="2.0.0")


# ── Request / Response models ─────────────────────────────────────────────────

class SolveRequest(BaseModel):
    puzzleImageB64: str   # base64 ảnh nền / puzzle
    pieceImageB64:  str   # base64 mảnh phụ (piece / icon / v.v.)

    @field_validator("puzzleImageB64", "pieceImageB64")
    @classmethod
    def must_be_valid_base64(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Base64 không được để trống")
        if "," in v:
            v = v.split(",", 1)[1]
        if not v or not v.strip():
            raise ValueError("Base64 không được để trống (sau khi xóa data URL prefix)")
        try:
            base64.b64decode(v, validate=True)
        except Exception:
            raise ValueError("Chuỗi không phải base64 hợp lệ")
        return v


def _b64_to_bytes(b64: str) -> bytes:
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    return base64.b64decode(b64)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/solve/{captcha_type}")
def solve(
    req: SolveRequest,
    captcha_type: str = Path(..., description="Loại captcha: " + ", ".join(REGISTRY)),
):
    """
    Giải captcha theo loại.  
    Trả về dict kết quả tương ứng với từng loại (xem docs từng solver).
    """
    try:
        solver = get_solver(captcha_type)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        puzzle_bytes = _b64_to_bytes(req.puzzleImageB64)
        piece_bytes  = _b64_to_bytes(req.pieceImageB64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Lỗi decode base64: {e}")

    try:
        result = solver.solve(puzzle_bytes, piece_bytes)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Lỗi xử lý ảnh: {e}")

    # Bỏ key _debug khỏi response (giữ lại nếu muốn debug)
    return {k: v for k, v in result.items() if not k.startswith("_")}


@app.get("/types")
def list_types():
    """Liệt kê tất cả loại captcha đang được hỗ trợ."""
    return {"supported": list(REGISTRY.keys())}


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    port = 5001
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=True)
