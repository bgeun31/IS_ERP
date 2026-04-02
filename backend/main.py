from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth import get_password_hash
from config import settings
from database import Base, SessionLocal, create_database_if_not_exists, engine
from minio_client import ensure_bucket
from routers.auth_router import router as auth_router
from routers.bundles_router import router as bundles_router
from routers.devices_router import router as devices_router
from routers.documents_router import router as documents_router
from routers.logs_router import router as logs_router
from routers.users_router import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시 초기화
    print("[DB] 데이터베이스 초기화 중...")
    create_database_if_not_exists()
    Base.metadata.create_all(bind=engine)

    # 기본 관리자 계정 생성
    from models import User
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == settings.ADMIN_USERNAME).first()
        if not admin:
            admin = User(
                username=settings.ADMIN_USERNAME,
                password_hash=get_password_hash(settings.ADMIN_PASSWORD),
                is_admin=True,
            )
            db.add(admin)
            db.commit()
            print(f"[DB] 관리자 계정 생성: {settings.ADMIN_USERNAME}")
        else:
            print(f"[DB] 관리자 계정 확인: {settings.ADMIN_USERNAME}")
    finally:
        db.close()

    # MinIO 버킷 초기화
    ensure_bucket()

    # 인프라보안 전용 템플릿 번들 시드
    from seeds.infra_security import seed_infra_security_bundle
    db2 = SessionLocal()
    try:
        seed_infra_security_bundle(db2)
    except Exception as e:
        print(f"[Seed] 번들 시드 오류: {e}")
    finally:
        db2.close()

    yield


app = FastAPI(
    title="네이버 인프라보안 장비 자산관리",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(logs_router)
app.include_router(devices_router)
app.include_router(documents_router)
app.include_router(bundles_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
