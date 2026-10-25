"""预置账号 seed：重复执行安全（已存在则跳过）

用法：python -m scripts.seed_users
"""

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User

# 演示账号密码会公开展示在登录入口（PRD 4.1）；管理员密码仅供本地开发，生产部署时改这里或用环境变量
PRESET_USERS = [
    {"username": "admin", "password": "admin123", "role": "admin"},
    {"username": "demo", "password": "demo123", "role": "demo"},
]


def main() -> None:
    db = SessionLocal()
    try:
        for item in PRESET_USERS:
            exists = db.scalar(select(User).where(User.username == item["username"]))
            if exists:
                print(f"skip: {item['username']} 已存在")
                continue
            db.add(
                User(
                    username=item["username"],
                    password_hash=hash_password(item["password"]),
                    role=item["role"],
                )
            )
            print(f"created: {item['username']} ({item['role']})")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
