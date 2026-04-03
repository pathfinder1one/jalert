"""
JALERT - Reports Router
PDF generation, CSV exports, S3 upload
"""
from pathlib import Path
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.core.database import get_db
from app.core.security import require_health_worker
from app.services.report_service import ReportGenerator
from app.models.user import User

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
    return {"download_url": url, "expires_in": 3600, "key": key}
