"""
Solver registry.
Để thêm loại captcha mới:
  1. Tạo file solvers/<tên>.py kế thừa BaseSolver
  2. Import và đăng ký vào REGISTRY bên dưới
"""

from solvers.puzzle import PuzzleSolver

REGISTRY: dict = {
    "puzzle": PuzzleSolver(),
    # "rotate": RotateSolver(),   ← ví dụ thêm loại mới
    # "text":   TextSolver(),
}


def get_solver(captcha_type: str):
    solver = REGISTRY.get(captcha_type)
    if solver is None:
        supported = list(REGISTRY.keys())
        raise ValueError(f"Loại captcha '{captcha_type}' chưa được hỗ trợ. Hỗ trợ: {supported}")
    return solver
