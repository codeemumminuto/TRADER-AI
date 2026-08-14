"""Autenticação por sessão (cookie httpOnly + token opaco na tabela `sessions`, não JWT) — dá
pra revogar sessão na hora e checar o IP a cada request, não só no login."""

import secrets
from datetime import date, datetime, timedelta, timezone

import bcrypt
from fastapi import Cookie, Depends, HTTPException, Request
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.db import get_db
from app.models import Session as SessionModel, User

COOKIE_NAME = "session_id"
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def get_client_ip(request: Request) -> str:
    """O nginx da VPS envia X-Forwarded-For/X-Real-IP — sem proxy na frente (dev local), cai
    pro IP direto da conexão."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def subscription_overdue(user: User) -> bool:
    """Admin nunca é cobrado; next_due_date nulo = sem cobrança configurada, nunca vence sozinho."""
    if user.role == "admin" or user.next_due_date is None:
        return False
    return user.next_due_date < date.today()


def authenticate(email: str, password: str, ip: str, db: DBSession) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(401, "E-mail ou senha inválidos.")

    now = datetime.now(timezone.utc)
    if user.locked_until and user.locked_until > now:
        raise HTTPException(423, "Conta temporariamente bloqueada por tentativas incorretas — tente novamente mais tarde.")

    if not verify_password(password, user.password_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= MAX_FAILED_ATTEMPTS:
            user.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
            user.failed_attempts = 0
        db.commit()
        raise HTTPException(401, "E-mail ou senha inválidos.")

    user.failed_attempts = 0
    user.locked_until = None
    db.commit()

    if user.pending_approval:
        raise HTTPException(403, "Sua conta ainda está pendente de aprovação do administrador.")

    if not user.is_active:
        raise HTTPException(401, "E-mail ou senha inválidos.")

    if subscription_overdue(user):
        raise HTTPException(402, "Assinatura vencida — contate o administrador pra renovar o acesso.")

    return user


def enforce_license_cap(user: User, db: DBSession) -> None:
    """Só N sessões simultâneas por vez (N = license_count) — logar de um PC/IP novo desloca
    automaticamente a(s) sessão(ões) mais antiga(s), sem precisar de aprovação manual de IP.
    Admin não tem limite (gestão da plataforma, não é o "produto" licenciado)."""
    if user.role == "admin":
        return
    now = datetime.now(timezone.utc)
    sessions = (
        db.query(SessionModel)
        .filter(SessionModel.user_id == user.id, SessionModel.expires_at > now)
        .order_by(SessionModel.created_at.desc())
        .all()
    )
    keep = max(1, user.license_count)
    for stale in sessions[keep:]:
        db.delete(stale)
    db.commit()


def create_session(user: User, ip: str, db: DBSession) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.session_ttl_hours)
    db.add(SessionModel(id=token, user_id=user.id, ip_address=ip, expires_at=expires_at))
    db.commit()
    enforce_license_cap(user, db)
    return token


def destroy_session(token: str | None, db: DBSession) -> None:
    if not token:
        return
    session = db.get(SessionModel, token)
    if session:
        db.delete(session)
        db.commit()


def get_current_user(
    request: Request,
    session_id: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: DBSession = Depends(get_db),
) -> User:
    if not session_id:
        raise HTTPException(401, "Não autenticado.")

    session = db.get(SessionModel, session_id)
    if not session:
        raise HTTPException(401, "Sessão inválida.")

    now = datetime.now(timezone.utc)
    if session.expires_at < now:
        db.delete(session)
        db.commit()
        raise HTTPException(401, "Sessão expirada — faça login novamente.")

    current_ip = get_client_ip(request)
    if session.ip_address != current_ip:
        db.delete(session)
        db.commit()
        raise HTTPException(401, "Sessão inválida para esse IP — faça login novamente.")

    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Usuário inativo.")
    if subscription_overdue(user):
        raise HTTPException(402, "Assinatura vencida — contate o administrador pra renovar o acesso.")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Acesso restrito ao administrador.")
    return user


def ensure_bootstrap_admin(db: DBSession) -> None:
    """Se não existir nenhum admin, cria um a partir de ADMIN_EMAIL/ADMIN_PASSWORD — sem isso
    não teria como logar na primeira vez que o app sobe com um banco vazio."""
    has_admin = db.query(User).filter(User.role == "admin").first()
    if has_admin:
        return
    db.add(User(
        email=settings.admin_email,
        password_hash=hash_password(settings.admin_password),
        role="admin",
        is_active=True,
    ))
    db.commit()


__all__ = [
    "COOKIE_NAME",
    "authenticate",
    "create_session",
    "destroy_session",
    "enforce_license_cap",
    "ensure_bootstrap_admin",
    "get_client_ip",
    "get_current_user",
    "hash_password",
    "require_admin",
    "subscription_overdue",
    "verify_password",
]
