from sqlmodel import create_engine, Session, SQLModel


SQLALCHEMY_DATABASE_URL = "sqlite:///./crazy_look.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_db():
    with Session(engine) as session:
        yield session