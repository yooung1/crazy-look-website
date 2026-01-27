from sqlmodel import SQLModel, Field
from typing import Optional



class User(SQLModel):
    __tablename__ = "user"

    id: Optional[int] = Field(primary_key=True)
    first_name: str = Field(..., min_length=2)
    last_name: str = Field(..., min_length=2)
    email: str = Field(...)
    hashed_password: str = Field(...)