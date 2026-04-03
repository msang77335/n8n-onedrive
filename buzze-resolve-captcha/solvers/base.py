"""
Base class cho tất cả các loại captcha solver.
Mọi solver mới phải kế thừa BaseSolver và implement phương thức solve().
"""

from abc import ABC, abstractmethod


class BaseSolver(ABC):

    @abstractmethod
    def solve(self, puzzle_bytes: bytes, piece_bytes: bytes) -> dict:
        """
        Args:
            puzzle_bytes: Raw bytes của ảnh nền / puzzle.
            piece_bytes : Raw bytes của mảnh phụ (piece / icon / v.v.).

        Returns:
            dict với ít nhất 1 trường kết quả, ví dụ:
              {"slideXProportion": 0.33}   ← puzzle slider
              {"angle": 47.5}              ← rotate captcha (tương lai)
        """
        ...
