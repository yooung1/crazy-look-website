from fastapi import APIRouter, status, Depends
from sqlmodel import Session, select
from src.user.schemas import UserPublic
from typing import Annotated
from src.user.schemas import UserCreate
from src.db.database import get_db
from src.user.models import User
from src.user.exceptions import UserAlreadyExist
from src.user.service import hash_password


user_router = APIRouter(prefix="/user", tags=["user"])

db = Annotated[Session, Depends(get_db)]


@user_router.post("/create", status_code=status.HTTP_201_CREATED, response_model=UserPublic)
def create_user(db: db, user_data:UserCreate) -> dict[str, str]:
    statement = select(User).where(User.email == user_data.email)
    user = db.exec(statement).first()

    if user:
        raise UserAlreadyExist()
    
    new_user = User(
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        email=user_data.email,
        hashed_password=hash_password(user_data.password)
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user