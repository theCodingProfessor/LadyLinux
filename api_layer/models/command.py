from pydantic import BaseModel, Field


class CommandResult(BaseModel):
    """Normalized subprocess response payload for API endpoints."""

    ok: bool = Field(..., description="True when returncode is zero")
    stdout: str = Field(default="", description="Captured standard output")
    stderr: str = Field(default="", description="Captured standard error")
    returncode: int = Field(..., description="Subprocess return code")
