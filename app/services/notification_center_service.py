"""
JALERT - Notification Center Service
Persisted notification inbox, read state, and delivery logs.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from fastapi import HTTPException
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import (
    AlertSeverity,
    Notification,
    NotificationChannel,
    NotificationDeliveryStatus,
)


class NotificationCenterService:
    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        user_id: str,
        kind: str,
        title: str,
        message: str,
        channel: NotificationChannel = NotificationChannel.IN_APP,
        delivery_status: NotificationDeliveryStatus = NotificationDeliveryStatus.QUEUED,
        severity: Optional[AlertSeverity] = None,
        alert_id: Optional[str] = None,
        village_id: Optional[str] = None,
        link: Optional[str] = None,
        data: Optional[dict[str, Any]] = None,
    ) -> Notification:
        notification = Notification(
            user_id=user_id,
            village_id=village_id,
            alert_id=alert_id,
            kind=kind,
            channel=channel,
            severity=severity,
            title=title,
            message=message,
            link=link,
            delivery_status=delivery_status,
            data=data,
        )
        db.add(notification)
        await db.flush()
        return notification

    @staticmethod
    async def create_many(
        db: AsyncSession,
        *,
        user_ids: Iterable[str],
        kind: str,
        title: str,
        message: str,
        channel: NotificationChannel = NotificationChannel.IN_APP,
        delivery_status: NotificationDeliveryStatus = NotificationDeliveryStatus.QUEUED,
        severity: Optional[AlertSeverity] = None,
        alert_id: Optional[str] = None,
        village_id: Optional[str] = None,
        link: Optional[str] = None,
        data: Optional[dict[str, Any]] = None,
    ) -> list[Notification]:
        created: list[Notification] = []
        for user_id in user_ids:
            created.append(
                await NotificationCenterService.create(
                    db,
                    user_id=user_id,
                    kind=kind,
                    title=title,
                    message=message,
                    channel=channel,
                    delivery_status=delivery_status,
                    severity=severity,
                    alert_id=alert_id,
                    village_id=village_id,
                    link=link,
                    data=data,
                )
            )
        return created

    @staticmethod
    async def list_for_user(
        user_id: str,
        db: AsyncSession,
        *,
        unread_only: bool = False,
        limit: int = 50,
    ) -> list[Notification]:
        query = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            query = query.where(Notification.is_read == False)  # noqa: E712
        query = query.order_by(desc(Notification.created_at)).limit(limit)
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def mark_read(notification_id: str, user_id: str, db: AsyncSession) -> Notification:
        result = await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        notification = result.scalar_one_or_none()
        if notification is None:
            raise HTTPException(status_code=404, detail="Notification not found")

        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        notification.delivery_status = NotificationDeliveryStatus.READ
        await db.flush()
        return notification

    @staticmethod
    async def mark_all_read(user_id: str, db: AsyncSession) -> int:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
            .values(
                is_read=True,
                read_at=now,
                delivery_status=NotificationDeliveryStatus.READ,
            )
        )
        await db.flush()
        return int(result.rowcount or 0)
