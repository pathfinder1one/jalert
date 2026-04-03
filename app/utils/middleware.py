"""
JALERT - Rate Limiting & Request Logging Middleware
"""
import time
from fastapi import Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from loguru import logger

from app.core.config import settings
from app.core.redis_manager import redis_manager


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding window rate limiter using Redis.
    Default: 100 requests per 60 seconds per IP.
    """

    def __init__(self, app: ASGIApp, limit: int = None, window: int = None):
        super().__init__(app)
        self.limit = limit or settings.RATE_LIMIT_REQUESTS
        self.window = window or settings.RATE_LIMIT_WINDOW

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if (
            path in ("/health", "/", "/docs", "/openapi.json", "/favicon.ico")
            or path.startswith("/ws")
            or path.startswith("/assets/")
            or not path.startswith("/api/")
        ):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        identifier = f"{client_ip}:{path.split('/')[3] if len(path.split('/')) > 3 else 'global'}"

        try:
            allowed = await redis_manager.check_rate_limit(identifier, self.limit, self.window)
            if not allowed:
                logger.warning(f"Rate limit exceeded: {client_ip}")
                return Response(
                    content='{"detail":"Rate limit exceeded. Try again later."}',
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    media_type="application/json",
                )
        except Exception:
            pass

        return await call_next(request)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs all requests with timing"""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        logger.info(
            f"{request.method} {request.url.path} "
            f"-> {response.status_code} [{duration_ms}ms] "
            f"IP={request.client.host if request.client else 'unknown'}"
        )
        response.headers["X-Response-Time-Ms"] = str(duration_ms)
        return response
