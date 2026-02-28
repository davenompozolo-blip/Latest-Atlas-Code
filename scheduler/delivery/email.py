"""
ATLAS Terminal — Email Delivery via SendGrid
===============================================
Sends HTML emails with optional DOCX attachments.
API key read from SENDGRID_API_KEY environment variable.
"""
from __future__ import annotations

import base64
import os
import logging
from pathlib import Path

logger = logging.getLogger("atlas.scheduler.email")

_TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"


def _load_template(name: str) -> str:
    """Load an HTML email template."""
    path = _TEMPLATE_DIR / f"{name}.html"
    if path.exists():
        return path.read_text(encoding="utf-8")
    raise FileNotFoundError(f"Email template not found: {path}")


def send_email(
    to: str | list[str],
    subject: str,
    html_body: str,
    attachments: list[dict] | None = None,
    from_email: str | None = None,
):
    """Send an email via SendGrid.

    Args:
        to: Recipient email(s)
        subject: Email subject line
        html_body: HTML body content
        attachments: List of dicts with keys: filename, content (bytes), mime_type
        from_email: Sender email (defaults to ATLAS_FROM_EMAIL env var)
    """
    api_key = os.getenv("SENDGRID_API_KEY")
    if not api_key:
        logger.warning("SENDGRID_API_KEY not set — email not sent")
        return False

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import (
            Mail, Attachment, FileContent, FileName,
            FileType, Disposition,
        )
    except ImportError:
        logger.error("sendgrid package not installed — pip install sendgrid")
        return False

    if from_email is None:
        from_email = os.getenv("ATLAS_FROM_EMAIL", "reports@atlasterminal.io")

    if isinstance(to, str):
        to = [to]

    message = Mail(
        from_email=from_email,
        to_emails=to,
        subject=subject,
        html_content=html_body,
    )

    # Add attachments
    if attachments:
        for att in attachments:
            encoded = base64.b64encode(att["content"]).decode()
            attachment = Attachment(
                FileContent(encoded),
                FileName(att["filename"]),
                FileType(att.get("mime_type", "application/octet-stream")),
                Disposition("attachment"),
            )
            message.attachment = attachment

    try:
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        logger.info(f"Email sent to {to}: status={response.status_code}")
        return response.status_code in (200, 201, 202)
    except Exception as e:
        logger.error(f"SendGrid error: {e}")
        return False


def render_snapshot_email(
    firm_name: str,
    date_str: str,
    portfolio_value: str,
    week_return: str,
    mtd_return: str,
    ytd_return: str,
    top_movers: list[dict],
    regime_quant: str,
    regime_macro: str,
    commentary_excerpt: str,
    website_url: str,
    report_footer: str,
) -> str:
    """Render the weekly snapshot email from template."""
    template = _load_template("weekly_snapshot")

    movers_html = ""
    for m in top_movers[:5]:
        colour = "#10b981" if m.get("change", 0) >= 0 else "#ef4444"
        sign = "+" if m.get("change", 0) >= 0 else ""
        movers_html += (
            f'<tr><td style="padding:4px 8px; font-size:13px;">{m["ticker"]}</td>'
            f'<td style="padding:4px 8px; font-size:13px; color:{colour};'
            f' text-align:right;">{sign}{m["change"]:.1f}%</td></tr>'
        )

    return (
        template
        .replace("{{firm_name}}", firm_name)
        .replace("{{date}}", date_str)
        .replace("{{portfolio_value}}", portfolio_value)
        .replace("{{week_return}}", week_return)
        .replace("{{mtd_return}}", mtd_return)
        .replace("{{ytd_return}}", ytd_return)
        .replace("{{top_movers}}", movers_html)
        .replace("{{regime_quant}}", regime_quant)
        .replace("{{regime_macro}}", regime_macro)
        .replace("{{commentary_excerpt}}", commentary_excerpt)
        .replace("{{website_url}}", website_url)
        .replace("{{report_footer}}", report_footer)
    )
