"""
JALERT - Reports Router
PDF generation, CSV exports, upload, and report activity history.
"""
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from sqlalchemy import desc, select

from app.core.database import get_db
from app.core.security import require_health_worker
from app.services.report_service import ReportGenerator
from app.services.audit_service import AuditService
from app.schemas.schemas import AuditLogOut
from app.models.user import AuditLog, User, UserRole

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/files/{file_path:path}", include_in_schema=False)
async def download_local_report(file_path: str):
    """Serve locally stored report files when S3 is unavailable."""
    try:
        resolved = ReportGenerator.resolve_local_report_path(file_path)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid report path")

    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="Report file not found")

    return FileResponse(
        path=resolved,
        media_type=ReportGenerator.guess_media_type(resolved),
        filename=Path(file_path).name,
    )


@router.get("/{village_id}/pdf")
async def download_village_pdf(
    village_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Download full risk report as PDF"""
    pdf_bytes = await ReportGenerator.generate_village_pdf(village_id, db)
    await AuditService.log(
        db,
        action="report.pdf.download",
        resource_type="report",
        resource_id=village_id,
        user_id=current_user.id,
        detail={"village_id": village_id, "format": "pdf"},
    )
    filename = f"jalert_{village_id}_{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/{village_id}/csv/sensors")
async def download_sensor_csv(
    village_id: str,
    days: int = Query(default=7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Download sensor readings as CSV"""
    csv_bytes = await ReportGenerator.generate_sensor_csv(village_id, db, days=days)
    await AuditService.log(
        db,
        action="report.csv.download",
        resource_type="report",
        resource_id=village_id,
        user_id=current_user.id,
        detail={"village_id": village_id, "format": "csv", "days": days},
    )
    filename = f"sensors_{village_id}_{days}d.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/{village_id}/pdf/upload")
async def upload_report_to_s3(
    village_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Generate PDF report and upload to S3, return presigned download URL"""
    pdf_bytes = await ReportGenerator.generate_village_pdf(village_id, db)
    key = f"reports/{village_id}/{datetime.utcnow().strftime('%Y/%m/%d')}/report.pdf"
    url = await ReportGenerator.upload_to_s3(pdf_bytes, key)
    await AuditService.log(
        db,
        action="report.share.create",
        resource_type="report",
        resource_id=village_id,
        user_id=current_user.id,
        detail={"village_id": village_id, "format": "pdf", "key": key},
    )
    return {"download_url": url, "expires_in": 3600, "key": key}


@router.get("/activity", response_model=List[AuditLogOut])
async def list_report_activity(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """List recent report generation and share activity."""
    query = (
        select(AuditLog)
        .where(AuditLog.resource_type == "report")
        .order_by(desc(AuditLog.created_at))
        .limit(limit)
    )
    if current_user.role != UserRole.ADMIN:
        query = query.where(AuditLog.user_id == current_user.id)
    result = await db.execute(query)
    return result.scalars().all()
