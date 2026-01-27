from src.user.router import user_router
from fastapi import APIRouter

api_router = APIRouter()



api_router.include_router(user_router)
