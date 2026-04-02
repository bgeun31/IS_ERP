from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_admin_user, get_current_user, get_password_hash
from database import get_db
from models import User
from schemas import UserCreate, UserDirectoryResponse, UserResponse, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    return db.query(User).order_by(User.created_at).all()


@router.get("/directory", response_model=list[UserDirectoryResponse])
def list_user_directory(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(User)
        .filter(User.is_admin.is_(False))
        .order_by(User.full_name.is_(None), User.full_name, User.username)
        .all()
    )


@router.post("", response_model=UserResponse, status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 사용자명입니다")
    user = User(
        username=body.username,
        password_hash=get_password_hash(body.password),
        full_name=body.full_name or None,
        phone_number=body.phone_number or None,
        position=body.position or None,
        is_admin=body.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    if body.password:
        user.password_hash = get_password_hash(body.password)
    if body.full_name is not None:
        user.full_name = body.full_name or None
    if body.phone_number is not None:
        user.phone_number = body.phone_number or None
    if body.position is not None:
        user.position = body.position or None
    if body.is_admin is not None:
        # 자기 자신의 admin 권한은 제거 불가
        if user.id == current_user.id and not body.is_admin:
            raise HTTPException(status_code=400, detail="자신의 관리자 권한은 제거할 수 없습니다")
        user.is_admin = body.is_admin
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="자기 자신은 삭제할 수 없습니다")
    db.delete(user)
    db.commit()
