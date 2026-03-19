from __future__ import annotations
from pydantic import BaseModel


class CommandResult(BaseModel):
    ok: bool
    stdout: str
    stderr: str
    returncode: int
