from pydantic import Field, BaseModel, EmailStr

class UserBase(BaseModel):
    first_name: str = Field(..., min_length=2)
    last_name: str = Field(..., min_length=2)
    email: EmailStr = Field(...)


class UserPublic(UserBase):
    id: int
    first_name: str
    last_name: str


class UserCreate(UserBase):
    password: str = Field(..., min_length=5)