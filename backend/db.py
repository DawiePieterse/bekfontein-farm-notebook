import os

from passlib.context import CryptContext
from sqlmodel import SQLModel, Session, create_engine, select

from models import Tag, User, UserRole

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)
PHOTOS_DIR = os.path.join(DATA_DIR, "photos")
os.makedirs(PHOTOS_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "notebook.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEFAULT_RECORDER_USERNAME = "andre"
DEFAULT_RECORDER_PASSWORD = "ChangeMe123!"  # must be changed on first login
DEFAULT_VIEWER_USERNAME = "son"
DEFAULT_VIEWER_PASSWORD = "ChangeMe123!"  # must be changed on first login

# Starter tag suggestions so Andre isn't starting from a completely blank
# list - free-form after this, he can add/drop tags as he actually uses them.
STARTER_TAGS = [
    "Crop Health & Pests", "Fruit Development & Ripening", "Harvest Observations",
    "Weather & Climate Impact", "Worker & Team Notes", "Equipment & Maintenance",
    "Block Maintenance", "Quality & Post-Harvest", "Safety & Incidents",
    "Ideas & Improvements", "General Observations",
]


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


def seed_defaults() -> None:
    with Session(engine) as session:
        if not session.exec(select(User)).first():
            session.add(User(
                username=DEFAULT_RECORDER_USERNAME,
                password_hash=pwd_context.hash(DEFAULT_RECORDER_PASSWORD),
                role=UserRole.recorder,
                display_name="Andre",
            ))
            session.add(User(
                username=DEFAULT_VIEWER_USERNAME,
                password_hash=pwd_context.hash(DEFAULT_VIEWER_PASSWORD),
                role=UserRole.viewer,
                display_name="Son",
            ))

        if not session.exec(select(Tag)).first():
            for name in STARTER_TAGS:
                session.add(Tag(name=name))

        session.commit()
