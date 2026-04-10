from pydantic import BaseModel, Field


class PackageInstallRequest(BaseModel):
    package: str = Field(..., min_length=1, max_length=128)
