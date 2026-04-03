"""
JALERT - Report Generation Service
PDF reports using ReportLab + CSV exports
Upload to AWS S3
"""
import io
import csv
import mimetypes
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_
from pathlib import Path

from app.models.user import Alert, AIPrediction, HealthReport, Village, SensorReading
from app.core.config import settings
from loguru import logger


class ReportGenerator:

    @staticmethod
    async def generate_village_pdf(village_id: str, db: AsyncSession) -> bytes:
        """Generate comprehensive PDF risk report for a village"""
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import cm
            from reportlab.lib import colors
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                HRFlowable, PageBreak
            )
            from reportlab.lib.enums import TA_CENTER, TA_LEFT

            # Fetch data
            village_res = await db.execute(select(Village).where(Village.id == village_id))
            village = village_res.scalar_one_or_none()
            if not village:
                raise ValueError(f"Village {village_id} not found")

            pred_res = await db.execute(
                select(AIPrediction)
                .where(AIPrediction.village_id == village_id)
                .order_by(desc(AIPrediction.created_at))
                .limit(1)
            )
            prediction = pred_res.scalar_one_or_none()

            alert_res = await db.execute(
                select(Alert)
                .where(Alert.village_id == village_id)
                .order_by(desc(Alert.created_at))
                .limit(10)
            )
            alerts = alert_res.scalars().all()

            health_res = await db.execute(
                select(HealthReport)
                .where(HealthReport.village_id == village_id)
                .order_by(desc(HealthReport.created_at))
                .limit(20)
            )
            health_reports = health_res.scalars().all()

            # Build PDF
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
            styles = getSampleStyleSheet()
            story = []

            # Colors
            primary_color = colors.HexColor("#1a3a5c")
            alert_color = colors.HexColor("#c0392b")
            safe_color = colors.HexColor("#27ae60")
            warning_color = colors.HexColor("#f39c12")

            title_style = ParagraphStyle(
                "title", parent=styles["Title"],
                textColor=primary_color, fontSize=20, spaceAfter=12
            )
            h2_style = ParagraphStyle(
                "h2", parent=styles["Heading2"],
                textColor=primary_color, fontSize=14, spaceAfter=8
            )
            body_style = styles["BodyText"]
            body_style.fontSize = 10

            # Header
            story.append(Paragraph("JALERT - Village Health Risk Report", title_style))
            story.append(Paragraph(
                f"Generated: {datetime.now(timezone.utc).strftime('%d %B %Y, %H:%M UTC')}",
                styles["Normal"]
            ))
            story.append(HRFlowable(width="100%", thickness=2, color=primary_color))
            story.append(Spacer(1, 0.5*cm))

            # Village Info
            story.append(Paragraph("Village Information", h2_style))
            village_data = [
                ["Village", village.name],
                ["District", village.district],
                ["State", village.state],
                ["Population", f"{village.population:,}"],
                ["Coordinates", f"{village.latitude:.4f}, {village.longitude:.4f}"],
            ]
            t = Table(village_data, colWidths=[6*cm, 10*cm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#ecf0f1")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(t)
            story.append(Spacer(1, 0.5*cm))

            # Risk Summary
            if prediction:
                story.append(Paragraph("AI Risk Assessment", h2_style))
                risk_color = {
                    "low": safe_color, "moderate": warning_color,
                    "high": colors.HexColor("#e67e22"), "critical": alert_color
                }.get(prediction.risk_category.value, primary_color)

                risk_data = [
                    ["Risk Score", f"{prediction.risk_score:.1f} / 100"],
                    ["Risk Category", prediction.risk_category.value.upper()],
                    ["Water Quality Score", f"{prediction.water_quality_score:.1f}" if prediction.water_quality_score else "N/A"],
                    ["Disease Risk Score", f"{prediction.disease_risk_score:.1f}" if prediction.disease_risk_score else "N/A"],
                    ["Outbreak Timeline", f"{prediction.outbreak_timeline_days} days" if prediction.outbreak_timeline_days else "No outbreak predicted"],
                ]
                rt = Table(risk_data, colWidths=[7*cm, 9*cm])
                rt.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#ecf0f1")),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("PADDING", (0, 0), (-1, -1), 6),
                    ("TEXTCOLOR", (1, 1), (1, 1), risk_color),
                    ("FONTNAME", (1, 1), (1, 1), "Helvetica-Bold"),
                ]))
                story.append(rt)
                story.append(Spacer(1, 0.3*cm))

                # Recommended Actions
                if prediction.recommended_actions:
                    story.append(Paragraph("Recommended Actions", h2_style))
                    for i, action in enumerate(prediction.recommended_actions[:8], 1):
                        story.append(Paragraph(f"{i}. {action}", body_style))
                    story.append(Spacer(1, 0.3*cm))

            # Recent Alerts
            if alerts:
                story.append(Paragraph("Recent Alerts", h2_style))
                alert_data = [["Date", "Type", "Severity", "Title"]]
                for a in alerts[:8]:
                    alert_data.append([
                        a.created_at.strftime("%d/%m %H:%M") if a.created_at else "",
                        a.alert_type.value,
                        a.severity.value.upper(),
                        a.title[:50],
                    ])
                at = Table(alert_data, colWidths=[3*cm, 4*cm, 3*cm, 7*cm])
                at.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), primary_color),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("PADDING", (0, 0), (-1, -1), 5),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f9fa")]),
                ]))
                story.append(at)
                story.append(Spacer(1, 0.3*cm))

            # Health Reports Summary
            story.append(Paragraph("Health Report Summary", h2_style))
            total_reports = len(health_reports)
            hospitalized = sum(1 for r in health_reports if r.is_hospitalized)
            all_symptoms = {}
            for r in health_reports:
                for s in r.symptoms.keys():
                    all_symptoms[s] = all_symptoms.get(s, 0) + 1

            story.append(Paragraph(f"Total reports (last 14 days): {total_reports}", body_style))
            story.append(Paragraph(f"Hospitalized: {hospitalized}", body_style))
            if all_symptoms:
                top_symptoms = sorted(all_symptoms.items(), key=lambda x: x[1], reverse=True)[:5]
                story.append(Paragraph(
                    f"Top symptoms: {', '.join(f'{s} ({c})' for s, c in top_symptoms)}",
                    body_style
                ))

            # Footer
            story.append(Spacer(1, 1*cm))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
            story.append(Paragraph(
                "JALERT - Intelligent Water & Health Alert System | Confidential",
                ParagraphStyle("footer", parent=styles["Normal"], fontSize=8, textColor=colors.grey)
            ))

            doc.build(story)
            pdf_bytes = buffer.getvalue()
            logger.info(f"PDF generated for village {village_id}: {len(pdf_bytes)} bytes")
            return pdf_bytes

        except Exception as e:
            logger.error(f"PDF generation failed: {e}")
            raise

    @staticmethod
    async def generate_sensor_csv(village_id: str, db: AsyncSession, days: int = 7) -> bytes:
        """Export sensor readings to CSV"""
        from datetime import timedelta
        since = datetime.now(timezone.utc) - timedelta(days=days)
        result = await db.execute(
            select(SensorReading)
            .where(and_(
                SensorReading.village_id == village_id,
                SensorReading.timestamp >= since,
            ))
            .order_by(desc(SensorReading.timestamp))
        )
        readings = result.scalars().all()

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            "timestamp", "sensor_id", "ph", "turbidity", "ecoli", "tds",
            "temperature", "nitrate", "arsenic", "fluoride",
            "rainfall_mm", "flood_level_m", "is_anomaly", "quality_score"
        ])
        for r in readings:
            writer.writerow([
                r.timestamp.isoformat() if r.timestamp else "",
                r.sensor_id, r.ph, r.turbidity, r.ecoli, r.tds,
                r.temperature, r.nitrate, r.arsenic, r.fluoride,
                r.rainfall_mm, r.flood_level_m, r.is_anomaly, r.quality_score,
            ])

        return buffer.getvalue().encode("utf-8")

    @staticmethod
    async def upload_to_s3(content: bytes, key: str, content_type: str = "application/pdf") -> str:
        """Upload report to AWS S3 and return presigned URL"""
        try:
            import boto3
            s3 = boto3.client(
                "s3",
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_REGION,
            )
            s3.put_object(
                Bucket=settings.S3_BUCKET_REPORTS,
                Key=key,
                Body=content,
                ContentType=content_type,
            )
            url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.S3_BUCKET_REPORTS, "Key": key},
                ExpiresIn=3600,
            )
            logger.info(f"Report uploaded to S3: {key}")
            return url
        except Exception as e:
            logger.warning(f"S3 upload failed, using local report storage: {e}")
            return await ReportGenerator.save_locally(content, key, content_type)

    @staticmethod
    async def save_locally(content: bytes, key: str, content_type: str = "application/pdf") -> str:
        """Persist a generated report locally and expose it through the API."""
        base_dir = Path(settings.LOCAL_REPORTS_DIR).resolve()
        file_path = (base_dir / key).resolve()

        if base_dir not in file_path.parents and file_path != base_dir:
            raise ValueError("Unsafe local report path")

        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(content)
        logger.info(f"Report saved locally: {file_path}")
        return f"/api/v1/reports/files/{key}"

    @staticmethod
    def resolve_local_report_path(file_path: str) -> Path:
        """Resolve a local report path safely within the report storage directory."""
        base_dir = Path(settings.LOCAL_REPORTS_DIR).resolve()
        resolved = (base_dir / file_path).resolve()
        if base_dir not in resolved.parents and resolved != base_dir:
            raise ValueError("Unsafe local report path")
        return resolved

    @staticmethod
    def guess_media_type(file_path: Path) -> str:
        media_type, _ = mimetypes.guess_type(str(file_path))
        return media_type or "application/octet-stream"
