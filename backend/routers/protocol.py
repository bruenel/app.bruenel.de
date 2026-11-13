import base64
import io
import re
import uuid
import zipfile
from datetime import datetime, date
from typing import List, Dict, Any, Tuple, Optional
from uuid import UUID
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import inspect, text, func
from sqlalchemy.orm import Session, selectinload

import database
import models
import schemas

router = APIRouter()

_SCHEMA_CHECKED = False

# Canonical PLZ -> Gemeinde mapping for UGG rollout areas
PLZ_TO_GEMEINDE: Dict[str, str] = {
    "73547": "Lorch",
    "73525": "Schwäbisch Gmünd",
    "73527": "Schwäbisch Gmünd",
    "73529": "Schwäbisch Gmünd",
    "73553": "Alfdorf",
    "73563": "Mögglingen",
    "73574": "Iggingen",
    "73577": "Ruppertshofen",
    "73571": "Göggingen",
    "73565": "Spraitbach",
    "73568": "Durlangen",
    "73575": "Leinzell",
    "73566": "Bartholomä",
    "73560": "Böbingen an der Rems",
    "73557": "Mutlangen",
    "73540": "Heubach",
    "73614": "Schorndorf",
    "73642": "Welzheim",
    "73655": "Plüderhausen",
    "73650": "Winterbach",
    "73630": "Remshalden",
}

CANONICAL_CITIES: List[Tuple[str, str]] = [
    ("lorch", "Lorch"),
    ("schw", "Schwäbisch Gmünd"),
    ("gmünd", "Schwäbisch Gmünd"),
    ("gmuend", "Schwäbisch Gmünd"),
    ("alfdorf", "Alfdorf"),
    ("mögglingen", "Mögglingen"),
    ("moegglingen", "Mögglingen"),
    ("iggingen", "Iggingen"),
    ("ruppertshofen", "Ruppertshofen"),
    ("göggingen", "Göggingen"),
    ("goeggingen", "Göggingen"),
    ("spraitbach", "Spraitbach"),
    ("durlangen", "Durlangen"),
    ("leinzell", "Leinzell"),
    ("bartholom", "Bartholomä"),
    ("böbingen", "Böbingen an der Rems"),
    ("boebingen", "Böbingen an der Rems"),
    ("mutlangen", "Mutlangen"),
    ("heubach", "Heubach"),
    ("schorndorf", "Schorndorf"),
    ("welzheim", "Welzheim"),
    ("plüderhausen", "Plüderhausen"),
    ("pluederhausen", "Plüderhausen"),
    ("winterbach", "Winterbach"),
    ("remshalden", "Remshalden"),
]


def normalize_gemeinde_ort(raw_ort: Optional[str], raw_plz: Optional[str] = "") -> str:
    """
    AI/Smart Location Normalizer:
    Cleans noisy PDF location strings (e.g. 'gps + Lorch', 'GPS 48.79 9.68 Lorch', '73547 Lorch', 'LORCH')
    and merges them into a single canonical Gemeinde name (e.g. 'Lorch').
    """
    plz_clean = re.sub(r"\D", "", str(raw_plz or ""))[:5]
    s = str(raw_ort or "").strip()

    # Check if PLZ directly maps when raw_ort is noisy or contains the same city
    s_lower = s.lower()
    for needle, canonical in CANONICAL_CITIES:
        if needle in s_lower:
            return canonical

    if plz_clean in PLZ_TO_GEMEINDE:
        return PLZ_TO_GEMEINDE[plz_clean]

    # Strip GPS / coordinate / label noise
    s = re.sub(
        r"\b(gps|koordinaten|standort|objekt[-\s]*adresse|gemeinde|ort|plz|stra[ßs]e|str\.|hausnummer|hnr\.?|nr\.?|we)\b",
        " ",
        s,
        flags=re.IGNORECASE,
    )
    # Remove coordinates, digits, plus signs, brackets, slashes, colons
    s = re.sub(r"[0-9+*:;/|\\()\[\]{}<>_.,!?\-]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()

    s_lower = s.lower()
    for needle, canonical in CANONICAL_CITIES:
        if needle in s_lower:
            return canonical

    if not s:
        return PLZ_TO_GEMEINDE.get(plz_clean, "Lorch" if plz_clean == "73547" else "")

    return " ".join(w.capitalize() for w in s.split())


def format_date_dd_mm_yyyy(val: Optional[str]) -> str:
    """Normalizes any ISO ('YYYY-MM-DD') or German date string to 'DD.MM.YYYY'."""
    if not val:
        return ""
    s = str(val).strip()
    if not s:
        return ""
    # Match ISO YYYY-MM-DD
    m_iso = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m_iso:
        return f"{int(m_iso.group(3)):02d}.{int(m_iso.group(2)):02d}.{m_iso.group(1)}"
    # Match German DD.MM.YYYY or DD.MM.YY (strip any trailing time like ' 08:01')
    m_de = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})", s)
    if m_de:
        yyyy = m_de.group(3)
        if len(yyyy) == 2:
            yyyy = f"20{yyyy}"
        return f"{int(m_de.group(1)):02d}.{int(m_de.group(2)):02d}.{yyyy}"
    return s


def parse_date_obj(val: Optional[str]) -> Optional[date]:
    """Parses 'DD.MM.YYYY' or 'YYYY-MM-DD' into a Python date object for Calendar/Task sync."""
    if not val:
        return None
    s = str(val).strip()
    m_de = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})", s)
    if m_de:
        try:
            return date(int(m_de.group(3)), int(m_de.group(2)), int(m_de.group(1)))
        except ValueError:
            return None
    m_iso = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m_iso:
        try:
            return date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
        except ValueError:
            return None
    return None


def sync_protocol_address_to_erp(db: Session, addr: models.Address) -> None:
    """
    Synchronizes a UGG Protocol Building (`models.Address`) with the core ERP modules:
      1. `models.Region` (normalized Gemeinde & PLZ)
      2. `models.Project` (UGG Ausbau project)
      3. `models.Team` (Field Team in Projects & Objects)
      4. `models.BuildingObject` (Building Object in Projects & Objects)
      5. `models.Assignment` (Task Calendar & Master Calendar assignment for the Field Team)
    """
    try:
        norm_ort = normalize_gemeinde_ort(addr.ort, addr.plz)
        if norm_ort and addr.ort != norm_ort:
            addr.ort = norm_ort

        plz_str = (addr.plz or "73547").strip()
        city_str = norm_ort or "Lorch"

        # 1. Region sync (merge any existing region for the same city)
        region = None
        all_regions = db.query(models.Region).all()
        for r in all_regions:
            r_norm = normalize_gemeinde_ort(r.city or r.name, r.postal_code)
            if r_norm and r_norm.lower() == city_str.lower():
                if r.city != city_str or r.name != city_str:
                    r.city = city_str
                    r.name = city_str
                region = r
                break
        if not region:
            region = models.Region(
                id=str(uuid.uuid4()),
                name=city_str,
                postal_code=plz_str,
                city=city_str,
                attributes={"source": "ugg_protocol"},
            )
            db.add(region)
            db.flush()

        # 2. Project sync
        project = (
            db.query(models.Project)
            .filter(models.Project.region_id == region.id)
            .first()
        )
        if not project:
            project = (
                db.query(models.Project)
                .filter(models.Project.name.ilike(f"%{city_str}%"))
                .first()
            )
        if not project:
            project = db.query(models.Project).order_by(models.Project.created_at.asc()).first()
        if not project:
            project = models.Project(
                id=str(uuid.uuid4()),
                name=f"UGG Glasfaser Ausbau {city_str}",
                code=f"UGG-{plz_str}",
                client_name="Unsere Grüne Glasfaser (UGG)",
                kst=1000,
                status="Active",
                region_id=region.id,
            )
            db.add(project)
            db.flush()

        # 3. Team sync with Projects & Objects -> Field Teams
        raw_team_name = (addr.team or "").strip()
        if re.search(r"\d+\.\d+", raw_team_name) or "ortsteil" in raw_team_name.lower() or raw_team_name.lower().startswith("techno("):
            city_team = (
                db.query(models.Team)
                .filter(
                    models.Team.name.ilike(f"%{city_str}%"),
                    ~models.Team.name.ilike("Techno(%"),
                )
                .first()
            )
            addr.team = city_team.name if city_team else ""
            raw_team_name = addr.team

        team_name = raw_team_name
        team_obj = None
        if team_name:
            team_obj = (
                db.query(models.Team)
                .filter(func.lower(models.Team.name) == team_name.lower())
                .first()
            )

        # 4. BuildingObject sync in Projects & Objects -> Building Objects
        street_house = f"{addr.strasse or ''} {addr.hausnummer or ''}".strip()
        full_address = f"{street_house}, {plz_str} {city_str}".strip(", ")
        b_status = (addr.building_status or "Ausbau terminiert").strip()
        obj_status_map = {
            "Abgeschlossen": "Completed",
            "In Bearbeitung": "In Progress",
            "Restarbeiten": "In Progress",
            "Ausbau terminiert": "Hausbegehung",
            "Offen": "Planned",
        }
        mapped_obj_status = obj_status_map.get(b_status, "Hausbegehung")

        b_obj = None
        for candidate in db.query(models.BuildingObject).all():
            c_attrs = candidate.attributes or {}
            if str(c_attrs.get("protocol_address_id", "")) == str(addr.id):
                b_obj = candidate
                break
            if street_house and candidate.address and street_house.lower() in candidate.address.lower():
                b_obj = candidate
                break

        units_cnt = max(1, int(addr.total_we or len(addr.units or []) or 1))
        ausbau_typ_str = addr.ausbau_typ or "Metalkanal"
        notes_summary = (
            f"Adress-ID: {addr.adress_id or '-'} | WE-Nr: {addr.projektnummer} | "
            f"Ausbau-Typ: {ausbau_typ_str} | Team: {team_name or '-'} | "
            f"Ausbau Datum: {format_date_dd_mm_yyyy(addr.ausbautermin) or '-'}"
        )
        merged_attrs = {
            **(b_obj.attributes if b_obj and isinstance(b_obj.attributes, dict) else {}),
            "protocol_address_id": str(addr.id),
            "adress_id": addr.adress_id or "",
            "projektnummer": addr.projektnummer or "",
            "ausbau_typ": ausbau_typ_str,
            "team": team_name,
            "building_status": b_status,
            "ausbautermin": format_date_dd_mm_yyyy(addr.ausbautermin),
            "abgeschlossen_datum": format_date_dd_mm_yyyy(addr.abgeschlossen_datum),
            "restarbeit_termin": format_date_dd_mm_yyyy(addr.restarbeit_termin),
        }

        if b_obj:
            b_obj.project_id = project.id
            b_obj.region_id = region.id
            b_obj.address = full_address
            b_obj.units_count = units_cnt
            b_obj.cabling_type = ausbau_typ_str
            b_obj.status = mapped_obj_status
            b_obj.notes = notes_summary
            b_obj.attributes = merged_attrs
        else:
            b_obj = models.BuildingObject(
                id=str(uuid.uuid4()),
                project_id=project.id,
                region_id=region.id,
                address=full_address,
                units_count=units_cnt,
                cabling_type=ausbau_typ_str,
                status=mapped_obj_status,
                notes=notes_summary,
                attributes=merged_attrs,
            )
            db.add(b_obj)
            db.flush()

        # 5. Task Calendar & Master Calendar Assignment sync
        task_date = (
            parse_date_obj(addr.ausbautermin)
            or parse_date_obj(addr.restarbeit_termin)
            or parse_date_obj(addr.abgeschlossen_datum)
            or (addr.created_at.date() if getattr(addr, "created_at", None) else date.today())
        )
        task_status_map = {
            "Abgeschlossen": "Completed",
            "Restarbeiten": "Remaining",
            "In Bearbeitung": "Remaining",
            "Ausbau terminiert": "Planned",
            "Offen": "Planned",
        }
        mapped_task_status = task_status_map.get(b_status, "Planned")

        existing_task = (
            db.query(models.Assignment)
            .filter(models.Assignment.object_id == b_obj.id)
            .first()
        )
        task_title = f"UGG Ausbau ({ausbau_typ_str}): {street_house}, {city_str} [{addr.adress_id or addr.projektnummer}]"
        task_instructions = (
            f"Adress-ID: {addr.adress_id or '-'} | Projektnummer: {addr.projektnummer} | "
            f"Einheiten: {units_cnt} WE | Ausbau-Typ: {ausbau_typ_str} | "
            f"Ausbau Datum: {format_date_dd_mm_yyyy(addr.ausbautermin) or '-'} | "
            f"Restarbeit Termin: {format_date_dd_mm_yyyy(addr.restarbeit_termin) or '-'}"
        )

        leader_emp_id = team_obj.leader_id if team_obj else None
        member_emp_ids = list(team_obj.member_ids or []) if team_obj else []
        if not leader_emp_id:
            first_emp = db.query(models.Employee).first()
            if not first_emp:
                first_emp = models.Employee(
                    id=str(uuid.uuid4()),
                    employee_number="BR-TECH-01",
                    first_name="Bauleitung",
                    last_name="Glasfaser",
                    email="bauleitung@bruenel.de",
                    role="Team Lead",
                    department="Glasfaser & NE4",
                    is_active=True,
                )
                db.add(first_emp)
                db.flush()
            leader_emp_id = first_emp.id
            if first_emp.id not in member_emp_ids:
                member_emp_ids.append(first_emp.id)
            if team_obj and not team_obj.leader_id:
                team_obj.leader_id = first_emp.id
                team_obj.member_ids = member_emp_ids

        if existing_task:
            existing_task.project_id = project.id
            existing_task.region_id = region.id
            existing_task.team_id = team_obj.id if team_obj else existing_task.team_id
            if leader_emp_id:
                existing_task.employee_id = leader_emp_id
            if member_emp_ids:
                existing_task.assigned_employee_ids = member_emp_ids
            existing_task.date = task_date
            existing_task.title = task_title
            existing_task.instructions = task_instructions
            existing_task.priority = "Urgent" if addr.is_priority else "High"
            existing_task.task_status = mapped_task_status
        else:
            new_task = models.Assignment(
                id=str(uuid.uuid4()),
                employee_id=leader_emp_id,
                team_id=team_obj.id if team_obj else None,
                assigned_employee_ids=member_emp_ids,
                project_id=project.id,
                region_id=region.id,
                object_id=b_obj.id,
                date=task_date,
                title=task_title,
                instructions=task_instructions,
                priority="Urgent" if addr.is_priority else "High",
                task_status=mapped_task_status,
                checklist=[
                    {"label": f"Ausbau ({ausbau_typ_str}) durchführen ({units_cnt} WE)", "done": b_status == "Abgeschlossen"},
                    {"label": "HÜP & Spleißen prüfen", "done": bool(addr.huep_installiert and addr.spleissen_fertig)},
                    {"label": "Fotos Uploaded", "done": bool(addr.upload_done)},
                ],
                comments=[],
            )
            db.add(new_task)

        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"ERP sync note for protocol address {getattr(addr, 'id', '')}: {exc}")


def _ensure_protocol_columns() -> None:
    """Safely ensures all newly added columns exist on `addresses` and `units` in PostgreSQL/SQLite."""
    global _SCHEMA_CHECKED
    if _SCHEMA_CHECKED or database.engine is None:
        return
    try:
        insp = inspect(database.engine)
        for table_name in ("addresses", "units"):
            if table_name in models.Base.metadata.tables and insp.has_table(table_name):
                table_obj = models.Base.metadata.tables[table_name]
                existing_cols = {c["name"] for c in insp.get_columns(table_name)}
                for col in table_obj.columns:
                    if col.name not in existing_cols:
                        col_type = col.type.compile(database.engine.dialect)
                        with database.engine.begin() as conn:
                            conn.execute(
                                text(f'ALTER TABLE "{table_name}" ADD COLUMN "{col.name}" {col_type}')
                            )
        _SCHEMA_CHECKED = True
    except Exception as exc:
        print(f"Protocol schema check note: {exc}")


def _serialize_address(addr: models.Address) -> schemas.AddressOut:
    """Serializes an Address ORM instance into AddressOut with normalized Ort and DD.MM.YYYY dates."""
    units_out = []
    for u in addr.units or []:
        we_art = getattr(u, "we_ausbau_art", None) or (
            "TA Installation"
            if getattr(u, "ta_installiert", False)
            else ("Reserve" if getattr(u, "reserve", False) else ("Ohne" if getattr(u, "ohne", False) else "TA Installation"))
        )
        units_out.append(
            schemas.UnitOut(
                id=u.id,
                address_id=u.address_id,
                etage=u.etage or "EG",
                unit_id=u.unit_id or "001",
                status=u.status or models.UnitStatusEnum.OFFEN,
                we_ausbau_art=we_art,
                ta_installiert=bool(getattr(u, "ta_installiert", False)),
                reserve=bool(getattr(u, "reserve", False)),
                ohne=bool(getattr(u, "ohne", False)),
                spleissen_fertig=bool(getattr(u, "spleissen_fertig", False)),
                flexrohr=bool(getattr(u, "flexrohr", False)),
            )
        )

    ausbau_typ = getattr(addr, "ausbau_typ", None) or getattr(addr, "loesungsoption", None) or "Metalkanal"
    norm_ort = normalize_gemeinde_ort(addr.ort, addr.plz)

    return schemas.AddressOut(
        id=addr.id,
        adress_id=getattr(addr, "adress_id", "") or "",
        projektnummer=addr.projektnummer or "",
        datum=format_date_dd_mm_yyyy(addr.datum),
        hausbegeher="",
        team=getattr(addr, "team", "") or "",
        building_status=getattr(addr, "building_status", None) or "Ausbau terminiert",
        is_priority=bool(getattr(addr, "is_priority", False)),
        ausbau_typ=ausbau_typ,
        ausbautermin=format_date_dd_mm_yyyy(getattr(addr, "ausbautermin", "")),
        abgeschlossen_datum=format_date_dd_mm_yyyy(getattr(addr, "abgeschlossen_datum", "")),
        restarbeit_termin=format_date_dd_mm_yyyy(getattr(addr, "restarbeit_termin", "")),
        plz=addr.plz or "",
        ort=norm_ort or addr.ort or "",
        strasse=addr.strasse or "",
        hausnummer=addr.hausnummer or "",
        owner_name="",
        owner_telefon="",
        owner_email="",
        total_we=addr.total_we or max(1, len(units_out)),
        ne3_status="",
        loesungsoption=ausbau_typ,
        flexrohr=bool(getattr(addr, "flexrohr", False)),
        huep_installiert=bool(getattr(addr, "huep_installiert", False)),
        spleissen_fertig=bool(getattr(addr, "spleissen_fertig", False)),
        upload_done=bool(getattr(addr, "upload_done", False)),
        genehmigt=bool(getattr(addr, "genehmigt", False)),
        rechnung_erstellt=bool(getattr(addr, "rechnung_erstellt", False)),
        rechnung_bezahlt=bool(getattr(addr, "rechnung_bezahlt", False)),
        pdf_filename=getattr(addr, "pdf_filename", None),
        has_pdf=bool(getattr(addr, "pdf_base64", None)),
        comments=list(getattr(addr, "comments", None) or []),
        created_at=addr.created_at,
        units=units_out,
    )


# ==============================================================================
# DSGVO-COMPLIANT LOCAL PDF PARSER ("UGG HAUSBEGEHUNGSPROTOKOLL")
# ==============================================================================

CHECKED_SYMBOLS = {"☑", "☒", "✓", "✔", "✗", "✘", "[x]", "[X]", "(x)", "(X)", "▣", "■"}
UNCHECKED_SYMBOLS = {"☐", "◻", "□", "[ ]", "( )", "◯"}

ETAGE_PATTERN = re.compile(
    r"\b(UG\s*\d*|KG|EG|HP|ZP|DG|SB|\d+\.\s*OG|OG\s*\d+|1\.OG|2\.OG|3\.OG|4\.OG|5\.OG)\b",
    re.IGNORECASE,
)


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"[ \t]+", " ", value or "").strip()


def _extract_pdf_artifacts(pdf_bytes: bytes) -> Tuple[str, List[List[List[str]]], Dict[str, Any]]:
    """
    Extracts raw text, structured tables, and AcroForm widget values strictly on-premise.
    Primary engine: PyMuPDF (fitz). Secondary: pdfplumber. Tertiary: pypdf.
    """
    full_text_pages: List[str] = []
    extracted_tables: List[List[List[str]]] = []
    form_widgets: Dict[str, Any] = {}

    try:
        import fitz  # PyMuPDF

        with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
            for page in doc:
                page_text = page.get_text("text", sort=True)
                full_text_pages.append(page_text)

                for widget in page.widgets() or []:
                    field_name = (widget.field_name or "").strip()
                    if field_name:
                        form_widgets[field_name] = widget.field_value

                if hasattr(page, "find_tables"):
                    try:
                        tabs = page.find_tables()
                        for tab in tabs.tables:
                            raw_rows = tab.extract()
                            cleaned_rows = [
                                [_normalize_whitespace(str(cell or "")) for cell in row]
                                for row in raw_rows
                                if row and any(cell for cell in row)
                            ]
                            if cleaned_rows:
                                extracted_tables.append(cleaned_rows)
                    except Exception:
                        pass

        return "\n".join(full_text_pages), extracted_tables, form_widgets
    except ImportError:
        pass
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Fehler beim Lesen der PDF-Datei mit PyMuPDF: {str(exc)}",
        )

    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text(layout=True) or page.extract_text() or ""
                full_text_pages.append(page_text)
                for table in page.extract_tables() or []:
                    cleaned_rows = [
                        [_normalize_whitespace(str(cell or "")) for cell in row]
                        for row in table
                        if row and any(cell for cell in row)
                    ]
                    if cleaned_rows:
                        extracted_tables.append(cleaned_rows)

        return "\n".join(full_text_pages), extracted_tables, form_widgets
    except ImportError:
        pass
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Fehler beim Lesen der PDF-Datei mit pdfplumber: {str(exc)}",
        )

    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(pdf_bytes))
        fields = reader.get_fields() or {}
        for k, v in fields.items():
            val = v.get("/V") if isinstance(v, dict) else getattr(v, "value", None)
            if val is not None:
                form_widgets[str(k)] = str(val)
        for page in reader.pages:
            full_text_pages.append(page.extract_text() or "")
        return "\n".join(full_text_pages), extracted_tables, form_widgets
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Kein lokaler PDF-Parser (PyMuPDF, pdfplumber oder pypdf) ist auf dem Server installiert.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Fehler beim Lesen der PDF-Datei: {str(exc)}",
        )


def _search_first(patterns: List[str], text: str, flags: int = re.IGNORECASE | re.MULTILINE) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags)
        if match:
            for group in match.groups():
                if group and _normalize_whitespace(group):
                    return _normalize_whitespace(group)
    return ""


def _parse_address_details(text: str, widgets: Dict[str, Any]) -> Tuple[str, str, str, str, int]:
    """Extracts Objekt-Adresse (PLZ, Ort, Straße, Nr, WE)."""
    addr_section_match = re.search(
        r"(?:Objekt[-\s]*Adresse|Objektdaten|Standort).*?(?=(?:Eigent[üu]mer|Z[äa]hlung|NE3|$))",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    addr_scope = addr_section_match.group(0) if addr_section_match else text

    plz = _search_first(
        [
            r"PLZ\s*[:\-]?\s*(\d{5})\b",
            r"\b(\d{5})\s+[A-ZÄÖÜa-zäöüß\- ]{2,30}",
        ],
        addr_scope,
    ) or _search_first([r"PLZ\s*[:\-]?\s*(\d{5})\b"], text)

    ort = _search_first(
        [
            r"Ort\s*[:\-]?\s*([A-ZÄÖÜa-zäöüß][A-ZÄÖÜa-zäöüß\-\s]{1,40}?)(?=\s+(?:Stra[ßs]e|Str\.|Hausnummer|Nr\.?|WE\b|$|\n))",
            r"PLZ\s*/?\s*Ort\s*[:\-]?\s*\d{5}\s+([^\n\r|]+)",
            r"\b\d{5}\s+([A-ZÄÖÜa-zäöüß][A-ZÄÖÜa-zäöüß\-\s]{1,35}?)(?=\s+(?:Stra[ßs]e|Str\.|Nr\.?|WE\b|\n|$))",
        ],
        addr_scope,
    ) or _search_first([r"Ort\s*[:\-]?\s*([^\n\r|]+)"], text)

    strasse = _search_first(
        [
            r"(?:Stra[ßs]e|Str\.)\s*[:\-]?\s*([A-ZÄÖÜa-zäöüß0-9.\-\s]+?)(?=\s+(?:Hausnummer|Haus-Nr\.?|Hnr\.?|Nr\.?|WE\b|\d{1,4}[a-zA-Z]?\s*$|\n))",
            r"(?:Stra[ßs]e|Str\.)\s*[:\-]?\s*([^\n\r|]+)",
        ],
        addr_scope,
    ) or _search_first([r"(?:Stra[ßs]e|Str\.)\s*[:\-]?\s*([^\n\r|]+)"], text)

    hausnummer = _search_first(
        [
            r"(?:Hausnummer|Haus-Nr\.?|Hnr\.?|Nr\.?)\s*[:\-]?\s*(\d{1,4}\s*[a-zA-Z]?(?:[-/]\d{1,4})?)\b",
        ],
        addr_scope,
    ) or _search_first(
        [r"(?:Hausnummer|Haus-Nr\.?|Hnr\.?|Nr\.?)\s*[:\-]?\s*(\d{1,4}\s*[a-zA-Z]?)\b"],
        text,
    )

    if strasse and not hausnummer:
        m_split = re.match(r"^(.+?)\s+(\d{1,4}[a-zA-Z]?)$", strasse)
        if m_split:
            strasse = m_split.group(1).strip()
            hausnummer = m_split.group(2).strip()

    we_str = _search_first(
        [
            r"(?:Anzahl\s+WE|Gesamt\s+WE|Wohneinheiten|WE\s*(?:Gesamt)?)\s*[:\-]?\s*(\d{1,3})\b",
            r"\bWE\b\s*[:\-]?\s*(\d{1,3})\b",
        ],
        addr_scope,
    ) or _search_first(
        [r"(?:Anzahl\s+WE|Wohneinheiten|\bWE)\s*[:\-]?\s*(\d{1,3})\b"],
        text,
    )

    try:
        total_we = max(1, int(we_str)) if we_str else 1
    except ValueError:
        total_we = 1

    norm_ort = normalize_gemeinde_ort(ort, plz)
    return plz, norm_ort, strasse, hausnummer, total_we


def _normalize_etage(raw_etage: str) -> str:
    val = _normalize_whitespace(raw_etage).upper()
    m_og = re.match(r"^(\d+)\.?\s*OG$", val)
    if m_og:
        return f"OG{m_og.group(1)}"
    m_ug = re.match(r"^(\d+)\.?\s*UG$", val)
    if m_ug:
        return f"UG{m_ug.group(1)}"
    return val


def _normalize_unit_id(raw_unit: str) -> str:
    val = _normalize_whitespace(raw_unit).upper()
    val = re.sub(r"^WE[-_\s]*", "", val)
    if val.isdigit():
        return val.zfill(3)
    return val


def _parse_zaehlung_units(
    text: str,
    tables: List[List[List[str]]],
    total_we: int,
) -> List[schemas.UnitProtocolSchema]:
    """
    Extracts Zählung Table (Etage, Unit-ID) from extracted PDF tables and text lines.
    Each Wohnung defaults to TA Installation (`we_ausbau_art="TA Installation"`, `ta_installiert=True`).
    """
    units: List[schemas.UnitProtocolSchema] = []
    seen_unit_ids = set()

    for table in tables:
        header_idx = None
        etage_col = None
        unit_col = None

        for r_idx, row in enumerate(table):
            row_joined = " ".join(row).lower()
            if "etage" in row_joined or "stockwerk" in row_joined or "unit" in row_joined or "we-nr" in row_joined:
                header_idx = r_idx
                for c_idx, cell in enumerate(row):
                    cl = cell.lower()
                    if any(k in cl for k in ("etage", "stockwerk", "geschoss", "ebene")):
                        etage_col = c_idx
                    elif any(k in cl for k in ("unit", "we-id", "we-nr", "einheit", "wohnung", "id")):
                        unit_col = c_idx
                break

        if header_idx is not None:
            for row in table[header_idx + 1 :]:
                if not row:
                    continue
                raw_etage = row[etage_col] if etage_col is not None and etage_col < len(row) else ""
                raw_unit = row[unit_col] if unit_col is not None and unit_col < len(row) else ""

                if not raw_etage or not raw_unit:
                    for cell in row:
                        if not raw_etage and ETAGE_PATTERN.search(cell):
                            raw_etage = ETAGE_PATTERN.search(cell).group(1)
                        elif not raw_unit and re.search(r"\b\d{1,3}\b", cell):
                            raw_unit = re.search(r"\b\d{1,3}\b", cell).group(0)

                if raw_etage and raw_unit:
                    norm_etage = _normalize_etage(raw_etage)
                    norm_unit = _normalize_unit_id(raw_unit)
                    if norm_unit and norm_unit not in seen_unit_ids:
                        seen_unit_ids.add(norm_unit)
                        units.append(
                            schemas.UnitProtocolSchema(
                                etage=norm_etage,
                                unit_id=norm_unit,
                                status=models.UnitStatusEnum.OFFEN,
                                we_ausbau_art="TA Installation",
                                ta_installiert=True,
                                reserve=False,
                                ohne=False,
                            )
                        )

    if not units:
        zaehlung_match = re.search(
            r"Z[äa]hlung.*?(?=(?:NE3|L[öo]sungsoption|Unterschrift|$))",
            text,
            re.IGNORECASE | re.DOTALL,
        )
        scan_scope = zaehlung_match.group(0) if zaehlung_match else text

        line_pattern_etage_first = re.compile(
            r"^\s*(UG\s*\d*|KG|EG|DG|\d+\.\s*OG|OG\s*\d+)\s+[\|:\-\s]*((?:WE[-_\s]?)?\d{1,3})\b",
            re.IGNORECASE | re.MULTILINE,
        )
        for match in line_pattern_etage_first.finditer(scan_scope):
            norm_etage = _normalize_etage(match.group(1))
            norm_unit = _normalize_unit_id(match.group(2))
            if norm_unit not in seen_unit_ids:
                seen_unit_ids.add(norm_unit)
                units.append(
                    schemas.UnitProtocolSchema(
                        etage=norm_etage,
                        unit_id=norm_unit,
                        we_ausbau_art="TA Installation",
                        ta_installiert=True,
                        reserve=False,
                        ohne=False,
                    )
                )

    if not units:
        for i in range(1, max(1, total_we) + 1):
            units.append(
                schemas.UnitProtocolSchema(
                    etage="EG" if i == 1 else f"OG{i - 1}",
                    unit_id=f"{i:03d}",
                    status=models.UnitStatusEnum.OFFEN,
                    we_ausbau_art="TA Installation",
                    ta_installiert=True,
                    reserve=False,
                    ohne=False,
                )
            )

    return units


def _extract_ausbau_typ(text: str, widgets: Dict[str, Any]) -> str:
    """
    Extracts Ausbau-Typ (Lösungsoption 1 in PDF is unified into Ausbau-Typ: Metalkanal | Leerrohr-Kamin).
    """
    raw_loesung = ""
    for k, v in widgets.items():
        kl = k.lower()
        if ("loesungsoption" in kl or "lösungsoption" in kl or "ausbau" in kl) and v:
            raw_loesung = _normalize_whitespace(str(v))
            break

    if not raw_loesung:
        loesung_patterns = [
            r"(?:Ausbau[-\s]*Typ|L[öo]sungsoption\s*1?)\s*[:\-]?\s*\n+\s*([^\n\r]+)",
            r"(?:Ausbau[-\s]*Typ|L[öo]sungsoption\s*1?)\s*[:\-]\s*([^\n\r]+)",
            r"L[öo]sungsoption\s*1\s+([^\n\r]+)",
        ]
        for pat in loesung_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m and _normalize_whitespace(m.group(1)):
                candidate = _normalize_whitespace(m.group(1))
                for sym in CHECKED_SYMBOLS | UNCHECKED_SYMBOLS:
                    candidate = candidate.replace(sym, "").strip()
                if candidate and not re.match(r"^L[öo]sungsoption\s*2", candidate, re.IGNORECASE):
                    raw_loesung = candidate
                    break

    combined = f"{raw_loesung} {text}".lower()
    if "leerrohr" in combined or "kamin" in combined:
        return "Leerrohr-Kamin"
    if "metalkanal" in combined or "metallkanal" in combined or "kabelkanal" in combined:
        return "Metalkanal"
    return "Metalkanal"


def parse_ugg_protocol_pdf(pdf_bytes: bytes, filename: str = "protokoll.pdf") -> schemas.ProtocolExtractedResponse:
    """
    End-to-end local parser for 'UGG Hausbegehungsprotokoll' PDFs.
    Strictly local execution (DSGVO/GDPR compliant — no cloud API calls).
    """
    raw_text, tables, widgets = _extract_pdf_artifacts(pdf_bytes)
    warnings: List[str] = []

    if not raw_text.strip() and not widgets:
        warnings.append(
            "Das PDF enthält keinen maschinenlesbaren Text (möglicherweise reiner Bild-Scan). Bitte Felder manuell prüfen."
        )

    projektnummer = _search_first(
        [
            r"(?:UGG[-\s]*Projektnummer|Projektnummer|Projekt[-\s]*Nr\.?|WE[-\s]*Nummer)\s*[:\-]?\s*([A-Z0-9\-]{6,25})",
            r"\b(N\d[A-Z]\d{7,12})\b",
        ],
        raw_text,
    )
    if not projektnummer:
        for k, v in widgets.items():
            if "projekt" in k.lower() and v:
                projektnummer = _normalize_whitespace(str(v))
                break
    if not projektnummer:
        warnings.append("UGG-Projektnummer konnte nicht eindeutig erkannt werden.")

    adress_id = _search_first(
        [
            r"(?:Adress[-\s]*ID\s*2?|Address[-\s]*ID)\s*[:\-]?\s*([A-Z0-9\-]{5,25})",
            r"\b(ABW\d{6,12})\b",
        ],
        raw_text,
    )
    if not adress_id and projektnummer:
        digits = "".join(ch for ch in projektnummer if ch.isdigit())
        if digits:
            adress_id = f"ABW{digits[-9:].zfill(9)}"

    plz, ort, strasse, hausnummer, total_we = _parse_address_details(raw_text, widgets)
    units = _parse_zaehlung_units(raw_text, tables, total_we)
    if len(units) > total_we:
        total_we = len(units)

    ausbau_typ = _extract_ausbau_typ(raw_text, widgets)
    pdf_b64 = base64.b64encode(pdf_bytes).decode("ascii")

    return schemas.ProtocolExtractedResponse(
        adress_id=adress_id,
        projektnummer=projektnummer,
        datum="",
        hausbegeher="",
        team="",
        building_status="Ausbau terminiert",
        is_priority=False,
        ausbau_typ=ausbau_typ,
        ausbautermin="",
        abgeschlossen_datum="",
        restarbeit_termin="",
        plz=plz,
        ort=ort,
        strasse=strasse,
        hausnummer=hausnummer,
        owner_name="",
        owner_telefon="",
        owner_email="",
        total_we=total_we,
        ne3_status="",
        loesungsoption=ausbau_typ,
        flexrohr=False,
        huep_installiert=False,
        spleissen_fertig=False,
        upload_done=False,
        genehmigt=False,
        rechnung_erstellt=False,
        rechnung_bezahlt=False,
        pdf_filename=filename,
        pdf_base64=pdf_b64,
        units=units,
        extraction_warnings=warnings,
    )


# ==============================================================================
# EXCEL (.XLSX) WORKBOOK GENERATOR (CLEANED & MATCHING USER SPECIFICATION)
# ==============================================================================

def _col_letter(col_idx_1based: int) -> str:
    result = ""
    while col_idx_1based > 0:
        col_idx_1based, rem = divmod(col_idx_1based - 1, 26)
        result = chr(65 + rem) + result
    return result


def _build_xlsx_fallback(sheets: List[Tuple[str, List[str], List[List[Any]]]]) -> bytes:
    """Zero-dependency OpenXML (.xlsx) generator if openpyxl is unavailable."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + "".join(
                f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                for i in range(1, len(sheets) + 1)
            )
            + "</Types>",
        )
        zf.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        zf.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            "<sheets>"
            + "".join(
                f'<sheet name="{xml_escape(name[:31])}" sheetId="{i}" r:id="rId{i}"/>'
                for i, (name, _, _) in enumerate(sheets, start=1)
            )
            + "</sheets></workbook>",
        )
        zf.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join(
                f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
                for i in range(1, len(sheets) + 1)
            )
            + "</Relationships>",
        )

        for idx, (_, headers, rows) in enumerate(sheets, start=1):
            all_rows = [headers] + rows
            row_xml_parts = []
            for r_num, row_vals in enumerate(all_rows, start=1):
                cells_xml = []
                for c_num, val in enumerate(row_vals, start=1):
                    ref = f"{_col_letter(c_num)}{r_num}"
                    if isinstance(val, (int, float)) and not isinstance(val, bool):
                        cells_xml.append(f'<c r="{ref}"><v>{val}</v></c>')
                    else:
                        text_val = xml_escape(str(val if val is not None else ""))
                        cells_xml.append(f'<c r="{ref}" t="inlineStr"><is><t>{text_val}</t></is></c>')
                row_xml_parts.append(f'<row r="{r_num}">{"".join(cells_xml)}</row>')

            sheet_xml = (
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                f'<sheetData>{"".join(row_xml_parts)}</sheetData>'
                "</worksheet>"
            )
            zf.writestr(f"xl/worksheets/sheet{idx}.xml", sheet_xml)

    buf.seek(0)
    return buf.getvalue()


def generate_protocols_excel_bytes(addresses: List[models.Address]) -> bytes:
    """
    Builds a clean, multi-sheet Excel (.xlsx) file WITHOUT unnecessary fields
    (removed Hausbegeher, NE3 Status, Eigentümer info, Email, separate Lösungsoption, WE-Status, and HBG Datum).
    Includes:
      - Ausbau-Typ (Metalkanal, Leerrohr-Kamin)
      - Status & Fortschritt (%)
      - Ausbau Datum, Abgeschlossen Datum, Restarbeit Termin (DD.MM.YYYY)
      - Ausbau Team (from Projects & Objects)
      - Adress ID2, WE Nummer, PLZ, Ort (normalized Gemeinde), Straße, Etage, Wohnung
      - Per-Wohnung: TA Installation, Reserve, Ohne
      - Whole-Building: Flexrohr, HÜP installiert, Spleißen fertig, Fotos Uploaded, Genehmigt, Rechnung erstellt, Rechnung bezahlt
    """
    tracking_headers = [
        "Ausbau-Typ",
        "Status",
        "Fortschritt (%)",
        "Ausbau Datum",
        "Abgeschlossen Datum",
        "Restarbeit Termin",
        "Ausbau Team",
        "Adress ID2",
        "WE Nummer",
        "PLZ",
        "Ort",
        "Straße",
        "Etage",
        "Wohnung",
        "TA Installation",
        "Reserve",
        "Ohne",
        "Flexrohr",
        "HÜP installiert",
        "Spleißen fertig",
        "Fotos Uploaded",
        "Genehmigt",
        "Rechnung erstellt",
        "Rechnung bezahlt",
    ]
    tracking_rows: List[List[Any]] = []

    building_headers = [
        "Adress-ID",
        "WE Nummer",
        "PLZ",
        "Gemeinde (Ort)",
        "Straße",
        "Haus",
        "Einheiten (WE)",
        "Fortschritt (%)",
        "Ausbau-Typ",
        "Ausbau Team",
        "Status",
        "Ausbau Datum",
        "Abgeschlossen Datum",
        "Restarbeit Termin",
        "Flexrohr",
        "HÜP installiert",
        "Spleißen fertig",
        "Fotos Uploaded",
        "Genehmigt",
        "Rechnung erstellt",
        "Rechnung bezahlt",
        "Kommentare",
    ]
    building_rows: List[List[Any]] = []

    unit_headers = [
        "Adress-ID",
        "WE Nummer",
        "Adresse",
        "Etage",
        "Wohnung (Unit-ID)",
        "TA Installation",
        "Reserve",
        "Ohne",
    ]
    unit_rows: List[List[Any]] = []

    for addr in addresses:
        units_list = list(addr.units or [])
        total_units = max(len(units_list), addr.total_we or 1)
        b_status = getattr(addr, "building_status", None) or "Ausbau terminiert"

        # Calculate building completion percentage
        checks = [
            bool(getattr(addr, "flexrohr", False)),
            bool(getattr(addr, "huep_installiert", False)),
            bool(getattr(addr, "spleissen_fertig", False)),
            bool(getattr(addr, "upload_done", False)),
            bool(getattr(addr, "genehmigt", False)),
            bool(getattr(addr, "rechnung_erstellt", False)),
            bool(getattr(addr, "rechnung_bezahlt", False)),
        ]
        if b_status == "Abgeschlossen":
            pct = 100
        else:
            done_checks = sum(1 for c in checks if c)
            pct = round((done_checks / len(checks)) * 100)
            if b_status == "In Bearbeitung" and pct < 25:
                pct = 25
            elif b_status == "Restarbeiten" and pct < 65:
                pct = 65
        progress_label = f"{pct}% ({total_units} WE)"

        ausbau_typ = getattr(addr, "ausbau_typ", None) or "Metalkanal"
        ab_termin = format_date_dd_mm_yyyy(getattr(addr, "ausbautermin", ""))
        abg_datum = format_date_dd_mm_yyyy(getattr(addr, "abgeschlossen_datum", ""))
        rest_termin = format_date_dd_mm_yyyy(getattr(addr, "restarbeit_termin", ""))
        adr_id = getattr(addr, "adress_id", "") or ""
        team_str = getattr(addr, "team", "") or ""
        norm_ort = normalize_gemeinde_ort(addr.ort, addr.plz)
        full_street = f"{addr.strasse or ''} {addr.hausnummer or ''}".strip()

        b_flex = "Ja" if getattr(addr, "flexrohr", False) else "Nein"
        b_huep = "Ja" if getattr(addr, "huep_installiert", False) else "Nein"
        b_spleiss = "Ja" if getattr(addr, "spleissen_fertig", False) else "Nein"
        b_upload = "Ja" if getattr(addr, "upload_done", False) else "Nein"
        b_genehmigt = "Ja" if getattr(addr, "genehmigt", False) else "Nein"
        b_re_erstellt = "Ja" if getattr(addr, "rechnung_erstellt", False) else "Nein"
        b_re_bezahlt = "Ja" if getattr(addr, "rechnung_bezahlt", False) else "Nein"

        comments_list = getattr(addr, "comments", None) or []
        comments_str = " | ".join(f"{c.get('text', '')}" for c in comments_list if isinstance(c, dict))

        building_rows.append(
            [
                adr_id,
                addr.projektnummer or "",
                addr.plz or "",
                norm_ort,
                addr.strasse or "",
                addr.hausnummer or "",
                addr.total_we or len(units_list),
                f"{pct}%",
                ausbau_typ,
                team_str,
                b_status,
                ab_termin,
                abg_datum,
                rest_termin,
                b_flex,
                b_huep,
                b_spleiss,
                b_upload,
                b_genehmigt,
                b_re_erstellt,
                b_re_bezahlt,
                comments_str,
            ]
        )

        if units_list:
            for u in units_list:
                we_art = getattr(u, "we_ausbau_art", None) or (
                    "TA Installation"
                    if getattr(u, "ta_installiert", False)
                    else ("Reserve" if getattr(u, "reserve", False) else ("Ohne" if getattr(u, "ohne", False) else "TA Installation"))
                )
                ta_str = "Ja" if (we_art == "TA Installation" or getattr(u, "ta_installiert", False)) else "Nein"
                res_str = "Ja" if (we_art == "Reserve" or getattr(u, "reserve", False)) else "Nein"
                ohne_str = "Ja" if (we_art == "Ohne" or getattr(u, "ohne", False)) else "Nein"

                tracking_rows.append(
                    [
                        ausbau_typ,
                        b_status,
                        progress_label,
                        ab_termin,
                        abg_datum,
                        rest_termin,
                        team_str,
                        adr_id,
                        addr.projektnummer or "",
                        addr.plz or "",
                        norm_ort,
                        full_street,
                        u.etage or "",
                        u.unit_id or "",
                        ta_str,
                        res_str,
                        ohne_str,
                        b_flex,
                        b_huep,
                        b_spleiss,
                        b_upload,
                        b_genehmigt,
                        b_re_erstellt,
                        b_re_bezahlt,
                    ]
                )

                unit_rows.append(
                    [
                        adr_id,
                        addr.projektnummer or "",
                        f"{full_street}, {addr.plz or ''} {norm_ort}",
                        u.etage or "",
                        u.unit_id or "",
                        ta_str,
                        res_str,
                        ohne_str,
                    ]
                )
        else:
            tracking_rows.append(
                [
                    ausbau_typ,
                    b_status,
                    progress_label,
                    ab_termin,
                    abg_datum,
                    rest_termin,
                    team_str,
                    adr_id,
                    addr.projektnummer or "",
                    addr.plz or "",
                    norm_ort,
                    full_street,
                    "-",
                    "-",
                    "Nein",
                    "Nein",
                    "Ja",
                    b_flex,
                    b_huep,
                    b_spleiss,
                    b_upload,
                    b_genehmigt,
                    b_re_erstellt,
                    b_re_bezahlt,
                ]
            )

    sheets_spec = [
        ("Ausbau-Tracking", tracking_headers, tracking_rows),
        ("Gebaeude Uebersicht", building_headers, building_rows),
        ("Wohnungen Detail", unit_headers, unit_rows),
    ]

    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
        from openpyxl.utils import get_column_letter

        wb = Workbook()
        wb.remove(wb.active)

        navy_fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
        gold_fill = PatternFill(start_color="FFC000", end_color="FFC000", fill_type="solid")
        red_fill = PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid")
        peach_fill = PatternFill(start_color="F4B084", end_color="F4B084", fill_type="solid")
        sky_fill = PatternFill(start_color="9BC2E6", end_color="9BC2E6", fill_type="solid")

        white_header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        dark_header_font = Font(name="Calibri", size=11, bold=True, color="16161A")
        body_font = Font(name="Calibri", size=10, color="16161A")
        completed_fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
        thin_border = Border(
            left=Side(style="thin", color="D1D5DB"),
            right=Side(style="thin", color="D1D5DB"),
            top=Side(style="thin", color="D1D5DB"),
            bottom=Side(style="thin", color="D1D5DB"),
        )

        for sheet_title, headers, rows in sheets_spec:
            ws = wb.create_sheet(title=sheet_title[:31])
            ws.views.sheetView[0].showGridLines = True
            ws.freeze_panes = "A2"

            ws.append(headers)
            for col_idx, h_text in enumerate(headers, start=1):
                cell = ws.cell(row=1, column=col_idx)
                cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=False)
                cell.border = thin_border

                if sheet_title == "Ausbau-Tracking":
                    if h_text in ("Status", "WE Fortschritt"):
                        cell.fill = gold_fill
                        cell.font = dark_header_font
                    elif h_text in (
                        "TA Installation",
                        "Reserve",
                        "Ohne",
                        "Flexrohr",
                        "HÜP installiert",
                        "Spleißen fertig",
                    ):
                        cell.fill = red_fill
                        cell.font = white_header_font
                    elif h_text in ("Fotos Uploaded", "Upload", "Genehmigt"):
                        cell.fill = peach_fill
                        cell.font = white_header_font
                    elif h_text in ("Rechnung erstellt", "Rechnung bezahlt"):
                        cell.fill = sky_fill
                        cell.font = white_header_font
                    else:
                        cell.fill = navy_fill
                        cell.font = white_header_font
                else:
                    cell.fill = navy_fill
                    cell.font = white_header_font

            ws.row_dimensions[1].height = 28

            for row_idx, r_data in enumerate(rows, start=2):
                ws.append(r_data)
                ws.row_dimensions[row_idx].height = 21
                is_done_row = "Abgeschlossen" in [str(x) for x in r_data[:12]]
                for c_idx in range(1, len(r_data) + 1):
                    cell = ws.cell(row=row_idx, column=c_idx)
                    cell.font = body_font
                    cell.border = thin_border
                    cell.alignment = Alignment(vertical="center")
                    if is_done_row:
                        cell.fill = completed_fill

            for col_idx, header_text in enumerate(headers, start=1):
                max_len = len(str(header_text))
                for r_data in rows[:200]:
                    if col_idx - 1 < len(r_data):
                        max_len = max(max_len, len(str(r_data[col_idx - 1] or "")))
                ws.column_dimensions[get_column_letter(col_idx)].width = min(max(max_len + 4, 13), 42)

        out = io.BytesIO()
        wb.save(out)
        out.seek(0)
        return out.getvalue()
    except Exception:
        return _build_xlsx_fallback(sheets_spec)


# ==============================================================================
# FASTAPI ENDPOINTS (/api/v1/protocol/*)
# ==============================================================================

@router.get(
    "/teams",
    summary="List Field Teams from Projects & Objects module for Ausbau Team selection",
)
def list_field_teams_for_protocol(
    db: Session = Depends(database.get_db),
):
    """Returns all Field Teams defined in the Projects & Objects module (`teams` table)."""
    try:
        noisy_teams = (
            db.query(models.Team)
            .filter(models.Team.name.ilike("Techno(%"))
            .all()
        )
        if noisy_teams:
            for nt in noisy_teams:
                db.delete(nt)
            db.commit()

        teams = db.query(models.Team).order_by(models.Team.name.asc()).all()
        if not teams:
            first_emp = db.query(models.Employee).first()
            first_proj = db.query(models.Project).first()
            t = models.Team(
                id=str(uuid.uuid4()),
                name="Team Lorch",
                leader_id=first_emp.id if first_emp else None,
                member_ids=[first_emp.id] if first_emp else [],
                project_id=first_proj.id if first_proj else None,
                notes="Field Team",
            )
            db.add(t)
            db.commit()
            teams = db.query(models.Team).order_by(models.Team.name.asc()).all()
        return [
            {
                "id": t.id,
                "name": t.name,
                "leader_id": t.leader_id,
                "member_ids": t.member_ids or [],
            }
            for t in teams
        ]
    except Exception:
        return []


@router.post(
    "/upload",
    response_model=schemas.ProtocolExtractedResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload UGG Hausbegehungsprotokoll PDF & extract structured JSON (No DB commit)",
)
async def upload_and_parse_protocol(
    file: UploadFile = File(..., description="Standardized UGG Hausbegehungsprotokoll PDF file"),
) -> schemas.ProtocolExtractedResponse:
    _ensure_protocol_columns()
    filename = file.filename or "UGG_Hausbegehungsprotokoll.pdf"
    if not filename.lower().endswith(".pdf") and file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ungültiges Dateiformat. Bitte laden Sie eine gültige PDF-Datei (.pdf) hoch.",
        )

    pdf_bytes = await file.read()
    if not pdf_bytes or len(pdf_bytes) < 64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Die hochgeladene PDF-Datei ist leer oder beschädigt.",
        )

    return parse_ugg_protocol_pdf(pdf_bytes, filename=filename)


def _sync_unit_ausbau_flags(
    we_ausbau_art: Optional[str],
    ta_installiert: Optional[bool],
    reserve: Optional[bool],
    ohne: Optional[bool],
) -> Tuple[str, bool, bool, bool]:
    if we_ausbau_art in ("TA Installation", "Reserve", "Ohne"):
        return (
            we_ausbau_art,
            we_ausbau_art == "TA Installation",
            we_ausbau_art == "Reserve",
            we_ausbau_art == "Ohne",
        )
    if reserve:
        return "Reserve", False, True, False
    if ohne:
        return "Ohne", False, False, True
    if ta_installiert:
        return "TA Installation", True, False, False
    return "Ohne", False, False, True


@router.post(
    "/confirm",
    response_model=schemas.AddressOut,
    status_code=status.HTTP_201_CREATED,
    summary="Confirm verified protocol JSON & persist to addresses (Master) and units (Detail)",
)
def confirm_and_save_protocol(
    payload: schemas.ProtocolConfirmRequest,
    overwrite: bool = Query(default=False, description="If true, updates existing protocol with same projektnummer"),
    db: Session = Depends(database.get_db),
) -> schemas.AddressOut:
    _ensure_protocol_columns()
    clean_proj = payload.projektnummer.strip()
    existing = (
        db.query(models.Address)
        .options(selectinload(models.Address.units))
        .filter(models.Address.projektnummer == clean_proj)
        .first()
    )

    clean_adress_id = (payload.adress_id or "").strip()
    if not clean_adress_id:
        digits = "".join(ch for ch in clean_proj if ch.isdigit())
        clean_adress_id = f"ABW{digits[-9:].zfill(9)}" if digits else f"ABW{str(uuid.uuid4().int)[:9]}"

    ausbau_typ_val = (payload.ausbau_typ or payload.loesungsoption or "Metalkanal").strip()
    norm_ort = normalize_gemeinde_ort(payload.ort, payload.plz)
    norm_ab_termin = format_date_dd_mm_yyyy(payload.ausbautermin)
    norm_abg_datum = format_date_dd_mm_yyyy(payload.abgeschlossen_datum)
    norm_rest_termin = format_date_dd_mm_yyyy(payload.restarbeit_termin)

    if existing:
        if not overwrite:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ein Protokoll mit der Projektnummer '{clean_proj}' existiert bereits.",
            )
        existing.adress_id = clean_adress_id
        existing.datum = format_date_dd_mm_yyyy(payload.datum)
        existing.hausbegeher = ""
        existing.team = (payload.team or "").strip()
        existing.building_status = (payload.building_status or "Ausbau terminiert").strip()
        existing.is_priority = bool(payload.is_priority)
        existing.ausbau_typ = ausbau_typ_val
        existing.ausbautermin = norm_ab_termin
        existing.abgeschlossen_datum = norm_abg_datum
        existing.restarbeit_termin = norm_rest_termin
        existing.plz = payload.plz.strip()
        existing.ort = norm_ort or payload.ort.strip()
        existing.strasse = payload.strasse.strip()
        existing.hausnummer = payload.hausnummer.strip()
        existing.owner_name = ""
        existing.owner_telefon = ""
        existing.owner_email = ""
        existing.total_we = payload.total_we
        existing.ne3_status = ""
        existing.loesungsoption = ausbau_typ_val
        existing.flexrohr = bool(payload.flexrohr)
        existing.huep_installiert = bool(payload.huep_installiert)
        existing.spleissen_fertig = bool(payload.spleissen_fertig)
        # Fotos Uploaded (upload_done) is ONLY checked when explicitly set, NEVER auto-checked on Hausbegehungsprotokoll upload
        existing.upload_done = bool(payload.upload_done)
        existing.genehmigt = bool(payload.genehmigt)
        existing.rechnung_erstellt = bool(payload.rechnung_erstellt)
        existing.rechnung_bezahlt = bool(payload.rechnung_bezahlt)
        if payload.pdf_base64:
            existing.pdf_base64 = payload.pdf_base64
            existing.pdf_filename = payload.pdf_filename or f"UGG_{clean_proj}.pdf"
        if payload.comments is not None:
            existing.comments = payload.comments

        existing.units.clear()
        db.flush()
        for unit_item in payload.units:
            we_art, ta_flag, res_flag, ohne_flag = _sync_unit_ausbau_flags(
                unit_item.we_ausbau_art, unit_item.ta_installiert, unit_item.reserve, unit_item.ohne
            )
            existing.units.append(
                models.Unit(
                    etage=unit_item.etage.strip(),
                    unit_id=unit_item.unit_id.strip(),
                    status=unit_item.status,
                    we_ausbau_art=we_art,
                    ta_installiert=ta_flag,
                    reserve=res_flag,
                    ohne=ohne_flag,
                    spleissen_fertig=bool(existing.spleissen_fertig),
                    flexrohr=bool(existing.flexrohr),
                )
            )
        db.commit()
        db.refresh(existing)
        sync_protocol_address_to_erp(db, existing)
        return _serialize_address(existing)

    new_address = models.Address(
        adress_id=clean_adress_id,
        projektnummer=clean_proj,
        datum=format_date_dd_mm_yyyy(payload.datum),
        hausbegeher="",
        team=(payload.team or "").strip(),
        building_status=(payload.building_status or "Ausbau terminiert").strip(),
        is_priority=bool(payload.is_priority),
        ausbau_typ=ausbau_typ_val,
        ausbautermin=norm_ab_termin,
        abgeschlossen_datum=norm_abg_datum,
        restarbeit_termin=norm_rest_termin,
        plz=payload.plz.strip(),
        ort=norm_ort or payload.ort.strip(),
        strasse=payload.strasse.strip(),
        hausnummer=payload.hausnummer.strip(),
        owner_name="",
        owner_telefon="",
        owner_email="",
        total_we=payload.total_we,
        ne3_status="",
        loesungsoption=ausbau_typ_val,
        flexrohr=bool(payload.flexrohr),
        huep_installiert=bool(payload.huep_installiert),
        spleissen_fertig=bool(payload.spleissen_fertig),
        upload_done=bool(payload.upload_done),
        genehmigt=bool(payload.genehmigt),
        rechnung_erstellt=bool(payload.rechnung_erstellt),
        rechnung_bezahlt=bool(payload.rechnung_bezahlt),
        pdf_filename=payload.pdf_filename or (f"UGG_{clean_proj}.pdf" if payload.pdf_base64 else None),
        pdf_base64=payload.pdf_base64,
        comments=payload.comments or [],
    )
    db.add(new_address)
    db.flush()

    for unit_item in payload.units:
        we_art, ta_flag, res_flag, ohne_flag = _sync_unit_ausbau_flags(
            unit_item.we_ausbau_art, unit_item.ta_installiert, unit_item.reserve, unit_item.ohne
        )
        new_unit = models.Unit(
            address_id=new_address.id,
            etage=unit_item.etage.strip(),
            unit_id=unit_item.unit_id.strip(),
            status=unit_item.status,
            we_ausbau_art=we_art,
            ta_installiert=ta_flag,
            reserve=res_flag,
            ohne=ohne_flag,
            spleissen_fertig=bool(new_address.spleissen_fertig),
            flexrohr=bool(new_address.flexrohr),
        )
        db.add(new_unit)

    db.commit()
    db.refresh(new_address)
    sync_protocol_address_to_erp(db, new_address)
    return _serialize_address(new_address)


@router.get(
    "/addresses",
    response_model=List[schemas.AddressOut],
    summary="List all Master addresses with nested Detail units",
)
def list_protocol_addresses(
    db: Session = Depends(database.get_db),
) -> List[schemas.AddressOut]:
    _ensure_protocol_columns()
    addresses = (
        db.query(models.Address)
        .options(selectinload(models.Address.units))
        .order_by(models.Address.created_at.desc())
        .all()
    )
    dirty_changed = False
    for a in addresses:
        cleaned_ort = normalize_gemeinde_ort(a.ort, a.plz)
        if cleaned_ort and a.ort != cleaned_ort:
            a.ort = cleaned_ort
            dirty_changed = True
    if dirty_changed:
        try:
            db.commit()
        except Exception:
            db.rollback()
    for a in addresses:
        sync_protocol_address_to_erp(db, a)
    return [_serialize_address(a) for a in addresses]


@router.get(
    "/addresses/{address_id}",
    response_model=schemas.AddressOut,
    summary="Get a single Master Building Address with all units and comments",
)
def get_protocol_address(
    address_id: UUID,
    db: Session = Depends(database.get_db),
) -> schemas.AddressOut:
    _ensure_protocol_columns()
    address_record = (
        db.query(models.Address)
        .options(selectinload(models.Address.units))
        .filter(models.Address.id == address_id)
        .first()
    )
    if not address_record:
        raise HTTPException(status_code=404, detail="Gebäude / Adresse wurde nicht gefunden.")
    return _serialize_address(address_record)


@router.put(
    "/addresses/{address_id}",
    response_model=schemas.AddressOut,
    summary="Update an existing Master Address",
)
def update_protocol_address(
    address_id: UUID,
    payload: schemas.ProtocolConfirmRequest,
    db: Session = Depends(database.get_db),
) -> schemas.AddressOut:
    _ensure_protocol_columns()
    address_record = (
        db.query(models.Address)
        .options(selectinload(models.Address.units))
        .filter(models.Address.id == address_id)
        .first()
    )
    if not address_record:
        raise HTTPException(status_code=404, detail="Adresse wurde nicht gefunden.")

    if payload.adress_id is not None:
        address_record.adress_id = payload.adress_id.strip()
    address_record.projektnummer = payload.projektnummer.strip()
    if payload.team is not None:
        address_record.team = payload.team.strip()
    if payload.building_status is not None:
        address_record.building_status = payload.building_status.strip()
    if payload.is_priority is not None:
        address_record.is_priority = bool(payload.is_priority)
    if payload.ausbau_typ is not None:
        address_record.ausbau_typ = payload.ausbau_typ.strip()
        address_record.loesungsoption = payload.ausbau_typ.strip()
    if payload.ausbautermin is not None:
        address_record.ausbautermin = format_date_dd_mm_yyyy(payload.ausbautermin)
    if payload.abgeschlossen_datum is not None:
        address_record.abgeschlossen_datum = format_date_dd_mm_yyyy(payload.abgeschlossen_datum)
    if payload.restarbeit_termin is not None:
        address_record.restarbeit_termin = format_date_dd_mm_yyyy(payload.restarbeit_termin)
    address_record.plz = payload.plz.strip()
    address_record.ort = normalize_gemeinde_ort(payload.ort, payload.plz) or payload.ort.strip()
    address_record.strasse = payload.strasse.strip()
    address_record.hausnummer = payload.hausnummer.strip()
    address_record.total_we = payload.total_we
    if payload.flexrohr is not None:
        address_record.flexrohr = bool(payload.flexrohr)
    if payload.huep_installiert is not None:
        address_record.huep_installiert = bool(payload.huep_installiert)
    if payload.spleissen_fertig is not None:
        address_record.spleissen_fertig = bool(payload.spleissen_fertig)
    if payload.upload_done is not None:
        address_record.upload_done = bool(payload.upload_done)
    if payload.genehmigt is not None:
        address_record.genehmigt = bool(payload.genehmigt)
    if payload.rechnung_erstellt is not None:
        address_record.rechnung_erstellt = bool(payload.rechnung_erstellt)
    if payload.rechnung_bezahlt is not None:
        address_record.rechnung_bezahlt = bool(payload.rechnung_bezahlt)
    if payload.pdf_base64:
        address_record.pdf_base64 = payload.pdf_base64
        address_record.pdf_filename = payload.pdf_filename or f"UGG_{address_record.projektnummer}.pdf"

    db.commit()
    db.refresh(address_record)
    sync_protocol_address_to_erp(db, address_record)
    return _serialize_address(address_record)


@router.patch(
    "/addresses/{address_id}",
    response_model=schemas.AddressOut,
    summary="Partially update building-level checkboxes, dates, status, or Ausbau-Typ",
)
def patch_protocol_address(
    address_id: UUID,
    payload: schemas.AddressPatchRequest,
    db: Session = Depends(database.get_db),
) -> schemas.AddressOut:
    _ensure_protocol_columns()
    address_record = (
        db.query(models.Address)
        .options(selectinload(models.Address.units))
        .filter(models.Address.id == address_id)
        .first()
    )
    if not address_record:
        raise HTTPException(status_code=404, detail="Gebäude wurde nicht gefunden.")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if isinstance(value, str):
            value = value.strip()
        if field in ("ausbautermin", "abgeschlossen_datum", "restarbeit_termin"):
            value = format_date_dd_mm_yyyy(value)
        elif field == "ort":
            value = normalize_gemeinde_ort(value, address_record.plz)
        setattr(address_record, field, value)
        if field == "ausbau_typ":
            address_record.loesungsoption = value

    # Auto-set abgeschlossen_datum to today (DD.MM.YYYY) if status changed to Abgeschlossen and date is empty
    if update_data.get("building_status") == "Abgeschlossen" and not getattr(
        address_record, "abgeschlossen_datum", None
    ):
        address_record.abgeschlossen_datum = datetime.utcnow().strftime("%d.%m.%Y")

    db.commit()
    db.refresh(address_record)
    sync_protocol_address_to_erp(db, address_record)
    return _serialize_address(address_record)


@router.post(
    "/addresses/{address_id}/comments",
    response_model=schemas.AddressOut,
    summary="Add a comment or status update to a building",
)
def add_building_comment(
    address_id: UUID,
    payload: schemas.AddressCommentCreate,
    db: Session = Depends(database.get_db),
) -> schemas.AddressOut:
    _ensure_protocol_columns()
    address_record = (
        db.query(models.Address)
        .options(selectinload(models.Address.units))
        .filter(models.Address.id == address_id)
        .first()
    )
    if not address_record:
        raise HTTPException(status_code=404, detail="Gebäude wurde nicht gefunden.")

    current_comments = list(getattr(address_record, "comments", None) or [])
    new_comment = {
        "id": str(uuid.uuid4()),
        "author": (payload.author or "Brünel Team").strip(),
        "text": payload.text.strip(),
        "created_at": datetime.utcnow().strftime("%d.%m.%Y %H:%M"),
    }
    current_comments.insert(0, new_comment)
    address_record.comments = current_comments

    db.commit()
    db.refresh(address_record)
    return _serialize_address(address_record)


@router.delete(
    "/addresses/{address_id}/comments/{comment_id}",
    response_model=schemas.AddressOut,
    summary="Delete a comment from a building",
)
def delete_building_comment(
    address_id: UUID,
    comment_id: str,
    db: Session = Depends(database.get_db),
) -> schemas.AddressOut:
    _ensure_protocol_columns()
    address_record = (
        db.query(models.Address)
        .options(selectinload(models.Address.units))
        .filter(models.Address.id == address_id)
        .first()
    )
    if not address_record:
        raise HTTPException(status_code=404, detail="Gebäude wurde nicht gefunden.")

    current_comments = list(getattr(address_record, "comments", None) or [])
    address_record.comments = [c for c in current_comments if str(c.get("id")) != str(comment_id)]

    db.commit()
    db.refresh(address_record)
    return _serialize_address(address_record)


@router.get(
    "/addresses/{address_id}/pdf",
    summary="View or download the stored PDF file for this building",
)
def get_building_pdf(
    address_id: UUID,
    download: bool = Query(default=False, description="Set true to force file download instead of inline preview"),
    db: Session = Depends(database.get_db),
):
    _ensure_protocol_columns()
    address_record = db.query(models.Address).filter(models.Address.id == address_id).first()
    if not address_record or not getattr(address_record, "pdf_base64", None):
        raise HTTPException(status_code=404, detail="Für dieses Gebäude ist noch keine PDF-Datei hinterlegt.")

    try:
        pdf_bytes = base64.b64decode(address_record.pdf_base64)
    except Exception:
        raise HTTPException(status_code=500, detail="Gespeicherte PDF-Datei konnte nicht dekodiert werden.")

    filename = getattr(address_record, "pdf_filename", None) or f"UGG_Protokoll_{address_record.projektnummer}.pdf"
    disposition = "attachment" if download else "inline"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


@router.post(
    "/addresses/{address_id}/pdf",
    response_model=schemas.AddressOut,
    summary="Attach or replace the PDF file stored on an existing building",
)
async def upload_building_pdf(
    address_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
) -> schemas.AddressOut:
    _ensure_protocol_columns()
    address_record = (
        db.query(models.Address)
        .options(selectinload(models.Address.units))
        .filter(models.Address.id == address_id)
        .first()
    )
    if not address_record:
        raise HTTPException(status_code=404, detail="Gebäude wurde nicht gefunden.")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Leere Datei.")

    address_record.pdf_filename = file.filename or f"UGG_Protokoll_{address_record.projektnummer}.pdf"
    address_record.pdf_base64 = base64.b64encode(pdf_bytes).decode("ascii")

    db.commit()
    db.refresh(address_record)
    return _serialize_address(address_record)


@router.delete(
    "/addresses/{address_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a Master Address and all linked Detail units",
)
def delete_protocol_address(
    address_id: UUID,
    db: Session = Depends(database.get_db),
):
    _ensure_protocol_columns()
    address_record = db.query(models.Address).filter(models.Address.id == address_id).first()
    if not address_record:
        raise HTTPException(status_code=404, detail="Adresse wurde nicht gefunden.")
    try:
        for b_obj in db.query(models.BuildingObject).all():
            attrs = b_obj.attributes or {}
            if str(attrs.get("protocol_address_id", "")) == str(address_id):
                db.query(models.Assignment).filter(models.Assignment.object_id == b_obj.id).delete()
                db.delete(b_obj)
    except Exception:
        pass
    db.delete(address_record)
    db.commit()
    return {"status": "deleted", "id": str(address_id)}


@router.post(
    "/addresses/{address_id}/units",
    response_model=schemas.UnitOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new Detail Wohnung (Unit) row to an existing Master Address",
)
def add_unit_to_address(
    address_id: UUID,
    payload: schemas.UnitProtocolSchema,
    db: Session = Depends(database.get_db),
) -> schemas.UnitOut:
    _ensure_protocol_columns()
    address_record = db.query(models.Address).filter(models.Address.id == address_id).first()
    if not address_record:
        raise HTTPException(status_code=404, detail="Adresse wurde nicht gefunden.")

    we_art, ta_flag, res_flag, ohne_flag = _sync_unit_ausbau_flags(
        payload.we_ausbau_art, payload.ta_installiert, payload.reserve, payload.ohne
    )

    new_unit = models.Unit(
        address_id=address_record.id,
        etage=payload.etage.strip(),
        unit_id=payload.unit_id.strip(),
        status=payload.status,
        we_ausbau_art=we_art,
        ta_installiert=ta_flag,
        reserve=res_flag,
        ohne=ohne_flag,
        spleissen_fertig=bool(getattr(address_record, "spleissen_fertig", False)),
        flexrohr=bool(getattr(address_record, "flexrohr", False)),
    )
    db.add(new_unit)
    db.flush()

    unit_count = db.query(models.Unit).filter(models.Unit.address_id == address_record.id).count()
    if unit_count > (address_record.total_we or 0):
        address_record.total_we = unit_count

    db.commit()
    db.refresh(new_unit)
    return new_unit


@router.patch(
    "/units/{unit_db_id}",
    response_model=schemas.UnitOut,
    summary="Update a single Wohnung row (TA Installation, Reserve, Ohne, or Status)",
)
def update_protocol_unit(
    unit_db_id: UUID,
    payload: schemas.UnitUpdateRequest,
    db: Session = Depends(database.get_db),
) -> schemas.UnitOut:
    _ensure_protocol_columns()
    unit_record = db.query(models.Unit).filter(models.Unit.id == unit_db_id).first()
    if not unit_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Wohneinheit (Unit) wurde nicht gefunden.",
        )

    update_data = payload.model_dump(exclude_unset=True)

    if "we_ausbau_art" in update_data:
        art = update_data["we_ausbau_art"]
        unit_record.we_ausbau_art = art
        unit_record.ta_installiert = art == "TA Installation"
        unit_record.reserve = art == "Reserve"
        unit_record.ohne = art == "Ohne"
    else:
        if "ta_installiert" in update_data:
            unit_record.ta_installiert = bool(update_data["ta_installiert"])
            if unit_record.ta_installiert:
                unit_record.we_ausbau_art = "TA Installation"
                unit_record.reserve = False
                unit_record.ohne = False
        if "reserve" in update_data:
            unit_record.reserve = bool(update_data["reserve"])
            if unit_record.reserve:
                unit_record.we_ausbau_art = "Reserve"
                unit_record.ta_installiert = False
                unit_record.ohne = False
        if "ohne" in update_data:
            unit_record.ohne = bool(update_data["ohne"])
            if unit_record.ohne:
                unit_record.we_ausbau_art = "Ohne"
                unit_record.ta_installiert = False
                unit_record.reserve = False

    for field in ("etage", "unit_id", "status", "spleissen_fertig", "flexrohr"):
        if field in update_data:
            setattr(unit_record, field, update_data[field])

    db.commit()
    db.refresh(unit_record)
    return unit_record


@router.delete(
    "/units/{unit_db_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a single Unit row",
)
def delete_protocol_unit(
    unit_db_id: UUID,
    db: Session = Depends(database.get_db),
):
    _ensure_protocol_columns()
    unit_record = db.query(models.Unit).filter(models.Unit.id == unit_db_id).first()
    if not unit_record:
        raise HTTPException(status_code=404, detail="Wohneinheit (Unit) wurde nicht gefunden.")
    db.delete(unit_record)
    db.commit()
    return {"status": "deleted", "id": str(unit_db_id)}


@router.get(
    "/export/excel",
    summary="Export all or selected UGG protocols (Master + Detail) as an Excel (.xlsx) workbook",
)
def export_protocols_excel(
    address_id: Optional[UUID] = Query(default=None, description="Optional single address UUID to export"),
    db: Session = Depends(database.get_db),
):
    _ensure_protocol_columns()
    query = db.query(models.Address).options(selectinload(models.Address.units))
    if address_id:
        query = query.filter(models.Address.id == address_id)
    addresses = query.order_by(models.Address.created_at.desc()).all()

    xlsx_bytes = generate_protocols_excel_bytes(addresses)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M")
    filename = (
        f"UGG_Protokoll_{addresses[0].projektnummer}_{timestamp}.xlsx"
        if (address_id and addresses)
        else f"UGG_Ausbau_Tracking_Export_{timestamp}.xlsx"
    )

    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/sample-pdf",
    summary="Download a standardized sample UGG Hausbegehungsprotokoll PDF for testing",
)
def download_sample_ugg_pdf(
    projektnummer: str = Query(default="N4E241593436"),
    adress_id: str = Query(default="ABW007413530"),
):
    """Generates a realistic UGG Hausbegehungsprotokoll PDF on-the-fly for testing the AI extractor."""
    try:
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)  # A4

        lines = [
            (50, 55, 16, "UGG Hausbegehungsprotokoll"),
            (50, 82, 11, f"UGG-Projektnummer: {projektnummer}"),
            (50, 100, 11, f"Adress-ID: {adress_id}"),
            (50, 134, 13, "Objekt-Adresse"),
            (50, 154, 11, "PLZ: 73547   Ort: Lorch"),
            (50, 172, 11, "Straße: Zollgasse   Nr: 2"),
            (50, 190, 11, "WE: 4"),
            (50, 224, 13, "Zählung"),
            (50, 244, 11, "Etage      Unit-ID"),
            (50, 262, 11, "EG         001"),
            (50, 280, 11, "1. OG      002"),
            (50, 298, 11, "2. OG      003"),
            (50, 316, 11, "DG         004"),
            (50, 354, 12, "Lösungsoption 1 / Ausbau-Typ"),
            (50, 372, 11, "Metalkanal"),
        ]
        for x, y, size, text_line in lines:
            page.insert_text((x, y), text_line, fontsize=size)

        pdf_bytes = doc.tobytes()
        doc.close()
    except Exception:
        content_stream = (
            "BT /F1 12 Tf 50 780 Td (UGG Hausbegehungsprotokoll) Tj "
            f"0 -18 Td (UGG-Projektnummer: {projektnummer}) Tj "
            f"0 -18 Td (Adress-ID: {adress_id}) Tj "
            "0 -22 Td (Objekt-Adresse) Tj "
            "0 -18 Td (PLZ: 73547   Ort: Lorch) Tj "
            "0 -18 Td (Strasse: Zollgasse   Nr: 2) Tj "
            "0 -18 Td (WE: 4) Tj "
            "0 -22 Td (Zaehlung) Tj "
            "0 -18 Td (Etage   Unit-ID) Tj "
            "0 -18 Td (EG      001) Tj "
            "0 -18 Td (1. OG   002) Tj "
            "0 -18 Td (2. OG   003) Tj "
            "0 -18 Td (DG      004) Tj "
            "0 -22 Td (Loesungsoption 1) Tj "
            "0 -18 Td (Metalkanal) Tj ET"
        ).encode("latin-1")
        pdf_bytes = (
            b"%PDF-1.4\n"
            b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
            + f"4 0 obj<</Length {len(content_stream)}>>stream\n".encode("ascii")
            + content_stream
            + b"\nendstream\nendobj\n"
            b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
            b"xref\n0 6\n0000000000 65535 f \n"
            b"trailer<</Size 6/Root 1 0 R>>\nstartxref\n9\n%%EOF"
        )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="UGG_Hausbegehungsprotokoll_{projektnummer}.pdf"'},
    )
