#!/usr/bin/env python
"""Study-tutor extraction worker.

One JSON request on stdin, one JSON reply on stdout. The Host never parses a
raw format itself, so every parser that needs a third-party library lives here.

Request  : {"op": "...", ...}
Reply    : {"ok": true, ...} | {"ok": false, "code": "...", "message": "..."}

Operations
  probe        describe the installed capabilities and versions
  extract      text / structure blocks from one document
  pdf          per-page text, embedded images and reference geometry
  office       convert an Office document to PDF (LibreOffice fallback path)
  images       normalise a raster image to PNG and report its size
  html         convert HTML / EPUB / LaTeX to structured blocks
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from typing import Any

# ---------------------------------------------------------------------------
# Third-party imports are optional: every branch degrades instead of failing.
# ---------------------------------------------------------------------------

MODULES: dict[str, Any] = {}


def load_modules() -> None:
    for name in ("pymupdf", "fitz", "docx", "pptx", "openpyxl", "PIL", "pypandoc", "numpy"):
        try:
            MODULES[name] = __import__(name)
        except Exception:
            MODULES[name] = None


def image_module():
    return MODULES.get("PIL")


def pymupdf_module():
    mod = MODULES.get("pymupdf") or MODULES.get("fitz")
    return mod


TEXT_EXTENSIONS = {
    ".txt", ".text", ".md", ".markdown", ".mdx", ".rst", ".org", ".adoc", ".asciidoc",
    ".html", ".htm", ".xhtml", ".xml", ".json", ".jsonl", ".yaml", ".yml", ".toml",
    ".csv", ".tsv", ".log", ".ini", ".cfg", ".conf", ".env", ".properties",
    ".tex", ".latex", ".bib", ".sty", ".cls",
    ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".c", ".h", ".cpp", ".hpp", ".cs",
    ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".scala", ".sh", ".ps1", ".bat",
    ".sql", ".r", ".m", ".jl", ".lua", ".pl", ".vue", ".svelte", ".ipynb",
}

RASTER_EXTENSIONS = {
    ".jpg", ".jpeg", ".jfif", ".png", ".webp", ".bmp", ".dib", ".tif", ".tiff",
    ".gif", ".ico", ".avif", ".pcx", ".tga", ".dds", ".jp2", ".j2k", ".psd",
    ".ppm", ".pgm", ".pnm", ".wmf", ".emf", ".heic", ".heif",
}

SUBTITLE_EXTENSIONS = {".srt", ".vtt", ".ass", ".ssa", ".lrc"}

OFFICE_EXTENSIONS = {".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".odt", ".ods", ".odp", ".rtf"}

ARCHIVE_EXTENSIONS = {".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar"}

MAX_TEXT_CHARS = 400_000


def reply(payload: dict) -> None:
    """Always emit UTF-8 bytes, whatever the console code page is."""
    sys.stdout.buffer.write(json.dumps(payload, ensure_ascii=True).encode("utf-8"))
    sys.stdout.buffer.flush()


def fail(code: str, message: str, **extra) -> dict:
    return {"ok": False, "code": code, "message": message, **extra}


# ---------------------------------------------------------------------------
# Formula handling. Everything is normalised to LaTeX and then given a plain
# reading a human can follow without a math renderer.
# ---------------------------------------------------------------------------

GREEK = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε", "varepsilon": "ε",
    "zeta": "ζ", "eta": "η", "theta": "θ", "vartheta": "ϑ", "iota": "ι", "kappa": "κ",
    "lambda": "λ", "mu": "μ", "nu": "ν", "xi": "ξ", "pi": "π", "rho": "ρ", "sigma": "σ",
    "tau": "τ", "upsilon": "υ", "phi": "φ", "varphi": "φ", "chi": "χ", "psi": "ψ", "omega": "ω",
    "Gamma": "Γ", "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ", "Xi": "Ξ", "Pi": "Π",
    "Sigma": "Σ", "Upsilon": "Υ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
}

OPERATOR_WORDS = {
    "times": "×", "cdot": "·", "div": "÷", "pm": "±", "mp": "∓", "ast": "∗",
    "leq": "≤", "le": "≤", "geq": "≥", "ge": "≥", "neq": "≠", "ne": "≠",
    "approx": "≈", "equiv": "≡", "sim": "∼", "propto": "∝", "infty": "∞",
    "in": "∈", "notin": "∉", "subset": "⊂", "subseteq": "⊆", "supset": "⊃",
    "cup": "∪", "cap": "∩", "emptyset": "∅", "forall": "∀", "exists": "∃",
    "nabla": "∇", "partial": "∂", "to": "→", "rightarrow": "→", "leftarrow": "←",
    "Rightarrow": "⇒", "Leftrightarrow": "⇔", "cdots": "⋯", "ldots": "…", "dots": "…",
    "mid": "|", "vert": "|", "Vert": "‖", "because": "∵", "therefore": "∴",
    "sum": "Σ", "prod": "Π", "int": "∫", "iint": "∬", "oint": "∮",
    "lim": "lim", "log": "log", "ln": "ln", "exp": "exp", "sin": "sin", "cos": "cos",
    "tan": "tan", "max": "max", "min": "min", "arg": "arg", "det": "det",
}


def _read_group(text: str, start: int) -> tuple[str, int]:
    """Read one balanced {...}, (…) or a single token starting at ``start``."""
    i = start
    while i < len(text) and text[i] == " ":
        i += 1
    if i >= len(text):
        return "", i
    if text[i] == "{":
        depth = 0
        j = i
        while j < len(text):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    return text[i + 1:j], j + 1
            j += 1
        return text[i + 1:], len(text)
    if text[i] == "\\":
        j = i + 1
        while j < len(text) and (text[j].isalpha() or text[j] == "\\"):
            j += 1
        return text[i:j], j
    return text[i], i + 1


def _sub_sup(match: re.Match) -> str:
    raw = match.group(1) or ""
    return "".join(SUPERSCRIPT.get(ch, ch) for ch in raw)


def _sub_sub(match: re.Match) -> str:
    raw = match.group(1) or ""
    return "".join(SUBSCRIPT.get(ch, ch) for ch in raw)


SUPERSCRIPT = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷",
    "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
    "n": "ⁿ", "i": "ⁱ", "x": "ˣ", "a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "d": "ᵈ", "e": "ᵉ",
    "k": "ᵏ", "m": "ᵐ", "p": "ᵖ", "t": "ᵗ", "T": "ᵀ", "*": "°",
}

SUBSCRIPT = {
    "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇",
    "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
    "a": "ₐ", "e": "ₑ", "i": "ᵢ", "j": "ⱼ", "k": "ₖ", "n": "ₙ", "o": "ₒ", "p": "ₚ",
    "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ", "x": "ₓ",
}


def latex_to_readable(latex: str) -> str:
    """Turn a LaTeX formula into something readable as plain text."""
    text = latex.strip()
    if text.startswith("$$") and text.endswith("$$"):
        text = text[2:-2]
    if text.startswith("$") and text.endswith("$") and len(text) > 1:
        text = text[1:-1]
    text = re.sub(r"\\(left|right|big|Big|bigg|Bigg)\b", "", text)
    text = re.sub(r"\\displaystyle|\\limits|\\!|\\,|\\;|\\:|\\quad|\\qquad|\\hspace\*?\{[^}]*\}", " ", text)

    def frac(match: re.Match) -> str:
        return f"({match.group(1)})/({match.group(2)})"

    for _ in range(3):
        text = re.sub(
            r"\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}",
            frac,
            text,
        )
        text = re.sub(
            r"\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}",
            lambda m: f"{m.group(1)}√({m.group(2)})",
            text,
        )
        text = re.sub(r"\\sqrt\s*\{([^{}]*)\}", lambda m: f"√({m.group(1)})", text)

    text = re.sub(r"\\text(bf|it|rm|sf|tt)?\s*\{([^{}]*)\}", lambda m: m.group(2), text)
    text = re.sub(r"\\mathrm\s*\{([^{}]*)\}", lambda m: m.group(1), text)
    text = re.sub(r"\\mathbb\s*\{([^{}]*)\}", lambda m: m.group(1), text)
    text = re.sub(r"\\mathcal\s*\{([^{}]*)\}\s*", lambda m: m.group(1), text)

    text = re.sub(r"\\sum\s*_\s*\{([^{}]*)\}\s*\^\s*\{([^{}]*)\}", lambda m: f"Σ({m.group(1)}..{m.group(2)})", text)
    text = re.sub(r"\\sum\s*\^\s*\{([^{}]*)\}\s*_\s*\{([^{}]*)\}", lambda m: f"Σ({m.group(2)}..{m.group(1)})", text)
    text = re.sub(r"\\prod\s*_\s*\{([^{}]*)\}\s*\^\s*\{([^{}]*)\}", lambda m: f"Π({m.group(1)}..{m.group(2)})", text)
    text = re.sub(r"\\sum\s*_\s*\{([^{}]*)\}", lambda m: f"Σ({m.group(1)})", text)
    text = re.sub(r"\\sum\b", "Σ", text)
    text = re.sub(r"\\prod\b", "Π", text)
    text = re.sub(r"\\int\s*_\s*\{?([^{}\s]*)\}?\s*\^\s*\{?([^{}\s]*)\}?", lambda m: f"∫[{m.group(1)},{m.group(2)}]", text)
    text = re.sub(r"\\int\s*_\s*\{([^{}]*)\}", lambda m: f"∫[{m.group(1)}]", text)
    text = re.sub(r"\\int\s*\^\s*\{([^{}]*)\}", lambda m: f"∫[..{m.group(1)}]", text)
    text = re.sub(r"\\int\b", "∫", text)
    text = re.sub(r"\\lim\s*_\s*\{([^{}]*)\}", lambda m: f"lim({m.group(1)})", text)

    text = re.sub(r"\\([A-Za-z]+)", lambda m: OPERATOR_WORDS.get(m.group(1), GREEK.get(m.group(1), m.group(1))), text)
    text = re.sub(r"\^\s*\{([^{}]*)\}", _sub_sup, text)
    text = re.sub(r"\^\s*(\w)", _sub_sup, text)
    text = re.sub(r"_\s*\{([^{}]*)\}", _sub_sub, text)
    text = re.sub(r"_\s*(\w)", _sub_sub, text)
    text = text.replace("{", "").replace("}", "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


INLINE_MATH = re.compile(r"(?<!\\)\$\$?(?!\$)(.*?)(?<!\\)\$\$?", re.S)
FENCE_MATH = re.compile(r"\\\[(.*?)\\\]|\\\((.*?)\\\)|\\begin\{(equation\*?|align\*?|displaymath|gather\*?)\}(.*?)\\end\{\3\}", re.S)


def find_formulas(text: str) -> list[dict]:
    """Return every math span with its LaTeX and a plain reading."""
    found: list[dict] = []
    for match in FENCE_MATH.finditer(text):
        latex = match.group(1) or match.group(2) or match.group(4) or ""
        found.append({
            "latex": latex.strip(),
            "read": latex_to_readable(latex),
            "display": "\\[" in match.group(0) or "equation" in match.group(0) or "align" in match.group(0) or "displaymath" in match.group(0),
            "start": match.start(),
            "end": match.end(),
        })
    if found:
        return found
    for match in INLINE_MATH.finditer(text):
        latex = match.group(1).strip()
        if not latex:
            continue
        found.append({
            "latex": latex,
            "read": latex_to_readable(latex),
            "display": match.group(0).startswith("$$"),
            "start": match.start(),
            "end": match.end(),
        })
    return found


# ---------------------------------------------------------------------------
# Document extraction
# ---------------------------------------------------------------------------

def _sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def read_bytes(path: str) -> bytes:
    with open(path, "rb") as handle:
        return handle.read()


def blocks_from_text(text: str, path: str) -> list[dict]:
    blocks: list[dict] = []
    lines = text.splitlines()
    paragraph: list[str] = []
    fence: str | None = None
    buffer: list[str] = []

    def flush_paragraph() -> None:
        if not paragraph:
            return
        joined = "\n".join(paragraph).strip()
        paragraph.clear()
        if not joined:
            return
        blocks.extend(split_paragraph(joined))

    for line in lines:
        stripped = line.strip()
        if fence is not None:
            if stripped.startswith(fence):
                blocks.append({"kind": "code", "text": "\n".join(buffer)})
                buffer.clear()
                fence = None
            else:
                buffer.append(line)
            continue
        if stripped.startswith("```") or stripped.startswith("~~~"):
            flush_paragraph()
            fence = stripped[:3]
            continue
        heading = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if heading:
            flush_paragraph()
            blocks.append({"kind": "heading", "level": len(heading.group(1)), "text": heading.group(2).strip()})
            continue
        if not stripped:
            flush_paragraph()
            continue
        paragraph.append(line)
    flush_paragraph()
    if fence is not None and buffer:
        blocks.append({"kind": "code", "text": "\n".join(buffer)})

    for block in blocks:
        if block["kind"] == "code":
            continue
        for formula in find_formulas(block.get("text", "")):
            block.setdefault("formulas", []).append({"latex": formula["latex"], "read": formula["read"], "display": formula["display"]})
    return blocks


def split_paragraph(text: str) -> list[dict]:
    """Split one paragraph around display math and long runs."""
    pieces: list[dict] = []
    cursor = 0
    for formula in find_formulas(text):
        if formula["display"]:
            before = text[cursor:formula["start"]].strip()
            if before:
                pieces.append({"kind": "para", "text": before})
            pieces.append({"kind": "formula", "latex": formula["latex"], "read": formula["read"], "display": True})
            cursor = formula["end"]
    rest = text[cursor:].strip()
    if rest:
        pieces.append({"kind": "para", "text": rest})
    return pieces or [{"kind": "para", "text": text}]


def extract_text_file(path: str) -> dict:
    raw = read_bytes(path)
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "utf-16", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", "replace")
    truncated = len(text) > MAX_TEXT_CHARS
    if truncated:
        text = text[:MAX_TEXT_CHARS]
    blocks = blocks_from_text(text, path)
    return {
        "ok": True,
        "kind": "text",
        "blocks": blocks,
        "text": text if len(text) <= 60_000 else text[:60_000],
        "characters": len(text),
        "truncated": truncated,
        "formulas": find_formulas(text),
    }


def extract_pdf(path: str, render_pages: int = 0, dpi: int = 130) -> dict:
    mod = pymupdf_module()
    if mod is None:
        return fail("PDF_ENGINE_MISSING", "PyMuPDF is not installed; PDF extraction is unavailable.")
    document = mod.open(path)
    pages: list[dict] = []
    blocks: list[dict] = []
    renders: list[dict] = []
    try:
        page_count = document.page_count
        for index in range(page_count):
            page = document[index]
            text = page.get_text("text") or ""
            page_blocks = blocks_from_text(text, path)
            for block in page_blocks:
                block["page"] = index + 1
            blocks.extend(page_blocks)
            images = []
            try:
                for image in page.get_images(full=True):
                    images.append({"xref": image[0], "width": image[2], "height": image[3]})
            except Exception:
                pass
            pages.append({
                "page": index + 1,
                "text": text if len(text) <= 20_000 else text[:20_000],
                "characters": len(text),
                "images": images,
            })
            if render_pages and index < render_pages:
                pixmap = page.get_pixmap(dpi=dpi)
                renders.append({"page": index + 1, "png": base64.b64encode(pixmap.tobytes("png")).decode("ascii")})
        text_all = "\n".join(page["text"] for page in pages)
        # A PDF whose text layer carries no real characters is either a scan or
        # one built with a font that has no text mapping. Both yield a page of
        # placeholder glyphs; reporting "empty" without saying why sends the
        # reader looking for a bug that is not there.
        notices: list[str] = []
        meaningful = sum(1 for ch in text_all if ch.isalnum() or "\u4e00" <= ch <= "\u9fff")
        if text_all.strip() and meaningful < len(text_all) * 0.35:
            notices.append(
                "The PDF text layer has almost no readable characters; it is probably a scan "
                "or uses a font without text mapping. OCR is not bundled, so only the page "
                "images are usable."
            )
        elif not text_all.strip():
            notices.append(
                "No text was extracted from this PDF; it is probably a scanned document. "
                "OCR is not bundled, so only the page images are usable."
            )
        return {
            "ok": True,
            "kind": "pdf",
            "pages": pages,
            "pageCount": page_count,
            "blocks": blocks,
            "renders": renders,
            "formulas": find_formulas(text_all),
            "notices": notices,
        }
    finally:
        document.close()


def extract_docx(path: str) -> dict:
    module = MODULES.get("docx")
    if module is None:
        return fail("DOCX_MODULE_MISSING", "python-docx is not installed.")
    document = module.Document(path)
    blocks: list[dict] = []
    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if not text:
            continue
        style = (paragraph.style.name or "").lower()
        if style.startswith("heading"):
            level = 1
            digits = re.findall(r"\d+", style)
            if digits:
                level = max(1, min(6, int(digits[0])))
            blocks.append({"kind": "heading", "level": level, "text": text})
        else:
            for piece in split_paragraph(text):
                blocks.append(piece)
    for table_index, table in enumerate(document.tables):
        rows = [[cell.text.strip() for cell in row.cells] for row in table.rows]
        if rows:
            blocks.append({"kind": "table", "rows": rows})
    text_all = "\n".join(block.get("text", "") for block in blocks)
    return {"ok": True, "kind": "docx", "blocks": blocks, "formulas": find_formulas(text_all)}


def extract_pptx(path: str) -> dict:
    module = MODULES.get("pptx")
    if module is None:
        return fail("PPTX_MODULE_MISSING", "python-pptx is not installed.")
    presentation = module.Presentation(path)
    slides: list[dict] = []
    blocks: list[dict] = []
    for index, slide in enumerate(presentation.slides):
        texts: list[str] = []
        for shape in slide.shapes:
            if not getattr(shape, "has_text_frame", False):
                continue
            for paragraph in shape.text_frame.paragraphs:
                line = "".join(run.text for run in paragraph.runs).strip()
                if line:
                    texts.append(line)
        slide_text = "\n".join(texts)
        slides.append({"slide": index + 1, "text": slide_text, "characters": len(slide_text)})
        blocks.append({"kind": "heading", "level": 2, "text": f"Slide {index + 1}"})
        for line in texts:
            for piece in split_paragraph(line):
                blocks.append(piece)
    text_all = "\n".join(slide["text"] for slide in slides)
    return {"ok": True, "kind": "pptx", "slides": slides, "blocks": blocks, "formulas": find_formulas(text_all)}


def extract_xlsx(path: str) -> dict:
    module = MODULES.get("openpyxl")
    if module is None:
        return fail("XLSX_MODULE_MISSING", "openpyxl is not installed.")
    workbook = module.load_workbook(path, data_only=True, read_only=True)
    sheets: list[dict] = []
    blocks: list[dict] = []
    try:
        for sheet in workbook.worksheets:
            rows: list[list[str]] = []
            for row_index, row in enumerate(sheet.iter_rows(values_only=True)):
                if row_index > 500:
                    break
                cells = ["" if value is None else str(value) for value in row]
                if any(cell.strip() for cell in cells):
                    rows.append(cells[:30])
            sheets.append({"name": sheet.title, "rows": rows})
            blocks.append({"kind": "heading", "level": 2, "text": sheet.title})
            if rows:
                blocks.append({"kind": "table", "rows": rows[:200]})
    finally:
        workbook.close()
    return {"ok": True, "kind": "xlsx", "sheets": sheets, "blocks": blocks, "formulas": []}


def extract_subtitle(path: str) -> dict:
    raw = read_bytes(path)
    text = raw.decode("utf-8-sig", "replace")
    cues: list[dict] = []
    if path.lower().endswith((".ass", ".ssa")):
        for line in text.splitlines():
            match = re.match(r"Dialogue:\s*\d+,([\d:.]+),([\d:.]+),(.*)", line)
            if match:
                body = match.group(3).split(",", 6)[-1]
                body = re.sub(r"\{[^}]*\}", "", body).strip()
                if body:
                    cues.append({"start": match.group(1), "end": match.group(2), "text": body})
    else:
        current: dict | None = None
        for line in text.splitlines():
            stripped = line.strip()
            if "-->" in stripped:
                parts = [part.strip() for part in stripped.split("-->")]
                current = {"start": parts[0], "end": parts[1] if len(parts) > 1 else ""}
                continue
            if current is not None:
                if not stripped:
                    if current.get("text"):
                        cues.append(current)
                    current = None
                    continue
                timestamp = re.match(r"^\[?(\d+:\d+(?::\d+)?(?:\.\d+)?)\]?$", stripped)
                if timestamp:
                    continue
                current["text"] = (current.get("text", "") + " " + stripped).strip()
        if current and current.get("text"):
            cues.append(current)
    blocks = [{"kind": "para", "text": cue["text"], "cueStart": cue["start"], "cueEnd": cue["end"]} for cue in cues]
    return {"ok": True, "kind": "subtitle", "cues": cues, "blocks": blocks, "formulas": []}


def extract_image(path: str) -> dict:
    module = image_module()
    if module is None:
        return fail("PIL_MISSING", "Pillow is not installed.")
    try:
        with module.Image.open(path) as image:
            image.load()
            width, height = image.size
            mode = image.mode
            converted = image.convert("RGB") if mode not in {"RGB", "RGBA"} else image
            buffer = io.BytesIO()
            converted.save(buffer, format="PNG")
            data = buffer.getvalue()
            return {
                "ok": True,
                "kind": "image",
                "width": width,
                "height": height,
                "mode": mode,
                "png": base64.b64encode(data).decode("ascii"),
                "bytes": len(data),
            }
    except Exception as error:  # unsupported by this build
        return fail("IMAGE_DECODE_FAILED", f"Pillow cannot decode this image: {error}")


def extract_via_pandoc(path: str, binary: str | None) -> dict:
    if not binary:
        return fail("PANDOC_MISSING", "pandoc is not available.")
    with tempfile.TemporaryDirectory() as workdir:
        target = os.path.join(workdir, "out.md")
        command = [
            binary, "--from", "auto", "--to", "gfm", "--wrap=none",
            "--extract-media", os.path.join(workdir, "media"),
            "--output", target, path,
        ]
        try:
            completed = subprocess.run(command, capture_output=True, timeout=180)
        except Exception as error:
            return fail("PANDOC_FAILED", str(error))
        if completed.returncode != 0 or not os.path.exists(target):
            message = (completed.stderr or b"").decode("utf-8", "replace")[:800]
            return fail("PANDOC_FAILED", message or "pandoc conversion failed")
        with open(target, encoding="utf-8", errors="replace") as handle:
            markdown = handle.read()
    blocks = blocks_from_text(markdown, path)
    return {"ok": True, "kind": "pandoc", "blocks": blocks, "text": markdown[:60_000], "formulas": find_formulas(markdown)}


def list_archive(path: str, limit: int = 200) -> dict:
    entries: list[dict] = []
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            for info in archive.infolist()[:limit]:
                entries.append({"name": info.filename, "bytes": info.file_size, "dir": info.is_dir()})
        return {"ok": True, "kind": "archive", "format": "zip", "entries": entries}
    import tarfile

    if tarfile.is_tarfile(path):
        with tarfile.open(path) as archive:
            for member in archive.getmembers()[:limit]:
                entries.append({"name": member.name, "bytes": member.size, "dir": member.isdir()})
        return {"ok": True, "kind": "archive", "format": "tar", "entries": entries}
    return fail("ARCHIVE_UNSUPPORTED", "Only zip and tar archives can be listed without extra tools.")


def probe() -> dict:
    pymupdf = pymupdf_module()
    capabilities: dict[str, Any] = {
        "pymupdf": getattr(pymupdf, "VersionBind", None) if pymupdf else None,
        "docx": MODULES.get("docx") is not None,
        "pptx": MODULES.get("pptx") is not None,
        "openpyxl": MODULES.get("openpyxl") is not None,
        "pillow": getattr(MODULES.get("PIL"), "__version__", None) if MODULES.get("PIL") else None,
        "pandoc": MODULES.get("pypandoc").get_pandoc_path() if MODULES.get("pypandoc") else None,
        "numpy": getattr(MODULES.get("numpy"), "__version__", None) if MODULES.get("numpy") else None,
        "python": sys.version.split()[0],
    }
    return {"ok": True, "capabilities": capabilities}


def dispatch(request: dict) -> dict:
    op = request.get("op")
    path = request.get("path") or ""
    if op == "probe":
        return probe()
    if op == "extract":
        extension = os.path.splitext(path)[1].lower()
        if extension in TEXT_EXTENSIONS:
            return extract_text_file(path)
        if extension == ".pdf":
            return extract_pdf(path, render_pages=int(request.get("renderPages") or 0), dpi=int(request.get("dpi") or 130))
        if extension == ".docx":
            return extract_docx(path)
        if extension == ".pptx":
            return extract_pptx(path)
        if extension in {".xlsx", ".xlsm"}:
            return extract_xlsx(path)
        if extension in SUBTITLE_EXTENSIONS:
            return extract_subtitle(path)
        if extension in RASTER_EXTENSIONS:
            return extract_image(path)
        if extension in ARCHIVE_EXTENSIONS:
            return list_archive(path)
        if extension in {".epub", ".doc", ".odt", ".rtf", ".ods", ".odp", ".ppt", ".xls"}:
            return extract_via_pandoc(path, request.get("pandoc"))
        return extract_via_pandoc(path, request.get("pandoc"))
    if op == "pdf":
        return extract_pdf(path, render_pages=int(request.get("renderPages") or 0), dpi=int(request.get("dpi") or 130))
    if op == "images":
        return extract_image(path)
    if op == "formulas":
        text = request.get("text") or ""
        return {"ok": True, "formulas": find_formulas(text)}
    if op == "readable":
        return {"ok": True, "read": latex_to_readable(request.get("latex") or "")}
    return fail("UNKNOWN_OP", f"Unknown operation: {op}")


def main() -> None:
    load_modules()
    raw = sys.stdin.buffer.read().decode("utf-8", "replace")
    try:
        request = json.loads(raw or "{}")
    except Exception as error:
        reply(fail("BAD_REQUEST", f"Invalid JSON request: {error}"))
        return
    try:
        reply(dispatch(request))
    except Exception as error:  # never let a parser crash the plugin
        reply(fail("EXTRACT_FAILED", f"{type(error).__name__}: {error}"))


if __name__ == "__main__":
    main()
