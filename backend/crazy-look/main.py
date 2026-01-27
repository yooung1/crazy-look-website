from fastapi import FastAPI
from src.global_endpoints import api_router
from contextlib import asynccontextmanager
from src.db.database import engine
from sqlmodel import SQLModel


@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    
    yield

app = FastAPI(title="EduChain API", lifespan=lifespan)


app.include_router(api_router, prefix="/api/v1")
