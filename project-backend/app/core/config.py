import os

# 配置统一走环境变量，本地开发用默认值，生产环境在部署时覆盖
# 类比前端：相当于 vite 的 .env.development / .env.production

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:123456@127.0.0.1:3306/portfolio_db?charset=utf8mb4",
)

BACKEND_CORS_ORIGINS = os.getenv(
    "BACKEND_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "12"))
