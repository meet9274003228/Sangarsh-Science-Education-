import os

try:
    from sqlalchemy import create_engine
    from sqlalchemy.ext.declarative import declarative_base
    from sqlalchemy.orm import sessionmaker
    HAS_SQLALCHEMY = True
except ImportError:
    HAS_SQLALCHEMY = False

# SQLite Database path during development, or environment variable for production (PostgreSQL)
DB_FILE = os.path.join(os.path.dirname(__file__), "omr_app.db")
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DB_FILE}")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if HAS_SQLALCHEMY:
    # Engine creation (connect_args is only for SQLite)
    if DATABASE_URL.startswith("sqlite"):
        engine = create_engine(
            DATABASE_URL, connect_args={"check_same_thread": False}
        )
    else:
        engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base = declarative_base()
else:
    engine = None
    SessionLocal = None
    
    # Mock class for compatibility when imported
    class MockBase:
        pass
    Base = MockBase

# FastAPI DB dependency generator
def get_db():
    if not HAS_SQLALCHEMY:
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
