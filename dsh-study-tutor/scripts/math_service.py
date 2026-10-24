#!/usr/bin/env python
"""Study-tutor formula service.

Turns LaTeX into something a human can actually read:

  * MathML  – rendered by the browser through the bundled Temml build
  * PNG     – rasterised through pandoc -> DOCX -> LibreOffice PDF -> PyMuPDF
  * plain   – superscripts, fraction bars, sum/integral bounds written inline
  * alt     – a short spoken form for screen readers and plain exports

One JSON request on stdin, one JSON reply on stdout.

Request
  {"op":"render",
   "items":[{"id":"f1","latex":"\\frac{a}{b}"}, ...],
   "pandoc":"...pandoc.exe",
   "node":"...node.exe",
   "libreofficeCli":"...lib/cli.js",
   "dpi":300}
Reply
  {"ok":true,"items":[{"id":"f1","latex":"...","read":"...","alt":"...","png":"<base64|null>"}]}
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools", "pylib"))

GREEK = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε", "varepsilon": "ε",
    "zeta": "ζ", "eta": "η", "theta": "θ", "iota": "ι", "kappa": "κ", "lambda": "λ", "mu": "μ",
    "nu": "ν", "xi": "ξ", "pi": "π", "rho": "ρ", "sigma": "σ", "tau": "τ", "upsilon": "υ",
    "phi": "φ", "varphi": "φ", "chi": "χ", "psi": "ψ", "omega": "ω",
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
    "because": "∵", "therefore": "∴", "leqslant": "⩽",
}

SUPERSCRIPT = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷",
    "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
    "n": "ⁿ", "i": "ⁱ", "x": "ˣ", "a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "d": "ᵈ", "e": "ᵉ",
    "k": "ᵏ", "m": "ᵐ", "p": "ᵖ", "t": "ᵗ", "T": "ᵀ",
}

SUBSCRIPT = {
    "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇",
    "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
    "a": "ₐ", "e": "ₑ", "i": "ᵢ", "j": "ⱼ", "k": "ₖ", "n": "ₙ", "o": "ₒ", "p": "ₚ",
    "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ", "x": "ₓ",
}

SPOKEN = {
    "×": "乘以", "·": "点乘", "÷": "除以", "±": "正负", "≤": "小于等于", "≥": "大于等于",
    "≠": "不等于", "≈": "约等于", "≡": "恒等于", "∞": "无穷大", "∈": "属于",
    "∉": "不属于", "⊂": "包含于", "⊆": "包含于或等于", "∪": "并集", "∩": "交集",
    "∅": "空集", "∀": "任意", "∃": "存在", "∇": "梯度", "∂": "偏导", "→": "趋于",
    "⇒": "推出", "⇔": "等价于", "Σ": "求和", "Π": "连乘", "∫": "积分", "√": "根号",
    "=": "等于", "<": "小于", ">": "大于", "+": "加", "-": "减",
}


def _group(text: str, start: int) -> tuple[str, int]:
    i = start
    while i < len(text) and text[i] == " ":
        i += 1
    if i >= len(text):
        return "", i
    if text[i] == "{":
        depth, j = 0, i
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
        while j < len(text) and text[j].isalpha():
            j += 1
        return text[i:j], j
    return text[i], i + 1


def latex_to_readable(latex: str) -> str:
    text = (latex or "").strip()
    if text.startswith("$$") and text.endswith("$$") and len(text) > 4:
        text = text[2:-2]
    elif text.startswith("$") and text.endswith("$") and len(text) > 2:
        text = text[1:-1]
    text = re.sub(r"\\(?:left|right|big|Big|bigg|Bigg)\b", "", text)
    text = re.sub(r"\\(?:displaystyle|limits|!|,|;|:|quad|qquad)\b", " ", text)
    text = re.sub(r"\\hspace\*?\{[^}]*\}", " ", text)

    for _ in range(4):
        previous = text
        text = re.sub(r"\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}", lambda m: f"({m.group(1)})/({m.group(2)})", text)
        text = re.sub(r"\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}", lambda m: f"{m.group(1)}√({m.group(2)})", text)
        text = re.sub(r"\\sqrt\s*\{([^{}]*)\}", lambda m: f"√({m.group(1)})", text)
        if text == previous:
            break

    text = re.sub(r"\\(?:text|textbf|textit|textrm|mathrm|mathbb|mathcal|mathbf|mathit|operatorname)\s*\{([^{}]*)\}", lambda m: m.group(1), text)

    text = re.sub(r"\\sum\s*_\s*\{([^{}]*)\}\s*\^\s*\{([^{}]*)\}", lambda m: f"Σ({m.group(1)}..{m.group(2)})", text)
    text = re.sub(r"\\sum\s*\^\s*\{([^{}]*)\}\s*_\s*\{([^{}]*)\}", lambda m: f"Σ({m.group(2)}..{m.group(1)})", text)
    text = re.sub(r"\\sum\s*_\s*\{([^{}]*)\}", lambda m: f"Σ({m.group(1)})", text)
    text = re.sub(r"\\prod\s*_\s*\{([^{}]*)\}\s*\^\s*\{([^{}]*)\}", lambda m: f"Π({m.group(1)}..{m.group(2)})", text)
    text = re.sub(r"\\sum\b", "Σ", text)
    text = re.sub(r"\\prod\b", "Π", text)
    text = re.sub(r"\\int\s*_\s*\{?([^{}\s^]*)\}?\s*\^\s*\{?([^{}\s]*)\}?", lambda m: f"∫[{m.group(1)},{m.group(2)}]", text)
    text = re.sub(r"\\int\s*_\s*\{([^{}]*)\}", lambda m: f"∫[{m.group(1)}]", text)
    text = re.sub(r"\\int\s*\^\s*\{([^{}]*)\}", lambda m: f"∫[..{m.group(1)}]", text)
    text = re.sub(r"\\int\b", "∫", text)
    text = re.sub(r"\\lim\s*_\s*\{([^{}]*)\}", lambda m: f"lim({m.group(1)})", text)
    text = re.sub(r"\\lim\b", "lim", text)

    text = re.sub(r"\\([A-Za-z]+)", lambda m: OPERATOR_WORDS.get(m.group(1)) or GREEK.get(m.group(1)) or m.group(1), text)
    text = re.sub(r"\^\s*\{([^{}]*)\}", lambda m: "".join(SUPERSCRIPT.get(ch, ch) for ch in m.group(1)), text)
    text = re.sub(r"\^\s*(\w)", lambda m: "".join(SUPERSCRIPT.get(ch, ch) for ch in m.group(1)), text)
    text = re.sub(r"_\s*\{([^{}]*)\}", lambda m: "".join(SUBSCRIPT.get(ch, ch) for ch in m.group(1)), text)
    text = re.sub(r"_\s*(\w)", lambda m: "".join(SUBSCRIPT.get(ch, ch) for ch in m.group(1)), text)
    text = text.replace("{", "").replace("}", "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def latex_to_spoken(latex: str) -> str:
    """A short spoken form, built from the readable form."""
    read = latex_to_readable(latex)
    spoken = []
    for char in read:
        spoken.append(SPOKEN.get(char, char))
    out = " ".join(spoken)
    out = re.sub(r"\s+", " ", out)
    out = re.sub(r"\(\s*([^()]*)\s*\)\s*/\s*\(\s*([^()]*)\s*\)", r"\1 除以 \2", out)
    out = re.sub(r"(?<![\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", out)
    out = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", out)
    return out.strip()


def run(command: list[str], timeout: int = 180) -> tuple[int, str]:
    try:
        completed = subprocess.run(command, capture_output=True, timeout=timeout)
    except Exception as error:
        return 1, f"{type(error).__name__}: {error}"
    message = (completed.stderr or b"").decode("utf-8", "replace")
    if completed.returncode != 0 and not message:
        message = (completed.stdout or b"").decode("utf-8", "replace")
    return completed.returncode, message


PAGE_BREAK = '```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```'


def render_pngs(items: list[dict], pandoc: str, node: str, libreoffice_cli: str, dpi: int) -> dict[str, bytes] | None:
    """Rasterise every formula; returns {id: png bytes} or None when unavailable."""
    if not (pandoc and node and libreoffice_cli):
        return None
    if not (os.path.exists(pandoc) and os.path.exists(node) and os.path.exists(libreoffice_cli)):
        return None

    with tempfile.TemporaryDirectory(prefix="dsh-study-math-") as workdir:
        markdown_path = os.path.join(workdir, "formulas.md")
        parts: list[str] = []
        for index, item in enumerate(items):
            marker = f"FORMULA {index + 1}"
            parts.append(marker)
            parts.append(f"$$\n{item['latex']}\n$$")
            if index != len(items) - 1:
                parts.append(PAGE_BREAK)
        with open(markdown_path, "w", encoding="utf-8") as handle:
            handle.write("\n\n".join(parts))

        docx_path = os.path.join(workdir, "formulas.docx")
        code, message = run([pandoc, markdown_path, "-o", docx_path, "--mathml", "--from", "markdown+raw_attribute"])
        if code != 0 or not os.path.exists(docx_path):
            return None

        pdf_path = os.path.join(workdir, "formulas.pdf")
        code, message = run([node, libreoffice_cli, "convert", "--input", docx_path, "--output", pdf_path], timeout=240)
        if code != 0 or not os.path.exists(pdf_path):
            return None

        try:
            import pymupdf  # type: ignore
        except Exception:
            try:
                import fitz as pymupdf  # type: ignore
            except Exception:
                return None

        results: dict[str, bytes] = {}
        document = pymupdf.open(pdf_path)
        try:
            for index, item in enumerate(items):
                marker = f"FORMULA {index + 1}"
                page = _find_marker_page(document, marker)
                if page is None:
                    continue
                rect = _content_rect(page, marker)
                if rect is None:
                    continue
                pixmap = page.get_pixmap(dpi=dpi, clip=rect)
                results[item["id"]] = pixmap.tobytes("png")
        finally:
            document.close()
        return results


def _find_marker_page(document, marker: str):
    for page in document:
        try:
            if page.search_for(marker):
                return page
        except Exception:
            continue
    return None


def _content_rect(page, marker: str):
    """Bounding box of everything drawn on the page except the marker line."""
    try:
        import pymupdf  # type: ignore
    except Exception:
        import fitz as pymupdf  # type: ignore

    marker_boxes = []
    try:
        marker_boxes = page.search_for(marker) or []
    except Exception:
        pass
    marker_bottom = max((box.y1 for box in marker_boxes), default=-1e9)

    boxes = []
    try:
        for block in page.get_text("blocks"):
            if len(block) >= 5 and block[4].strip():
                if block[1] <= marker_bottom + 1 and block[3] >= marker_bottom - 1:
                    continue
                boxes.append((block[0], block[1], block[2], block[3]))
    except Exception:
        pass
    try:
        for drawing in page.get_drawings():
            rect = drawing.get("rect")
            if rect is not None and rect.width > 0.3 and rect.height > 0.3:
                boxes.append((rect.x0, rect.y0, rect.x1, rect.y1))
    except Exception:
        pass
    try:
        for image in page.get_image_info():
            bbox = image.get("bbox")
            if bbox:
                boxes.append(tuple(bbox))
    except Exception:
        pass

    if not boxes:
        return None
    x0 = min(box[0] for box in boxes) - 8
    y0 = min(box[1] for box in boxes) - 8
    x1 = max(box[2] for box in boxes) + 8
    y1 = max(box[3] for box in boxes) + 8
    rect = pymupdf.Rect(x0, y0, x1, y1) & page.rect
    if rect.width < 4 or rect.height < 4:
        return None
    return rect


def dispatch(request: dict) -> dict:
    op = request.get("op") or "render"
    if op == "readable":
        latex = request.get("latex") or ""
        return {"ok": True, "read": latex_to_readable(latex), "alt": latex_to_spoken(latex)}

    items = request.get("items") or []
    if not isinstance(items, list) or not items:
        return {"ok": False, "code": "NOTHING_TO_RENDER", "message": "No formulas were supplied."}

    dpi = int(request.get("dpi") or 300)
    images = render_pngs(
        [{"id": str(item.get("id") or index), "latex": item.get("latex") or ""} for index, item in enumerate(items)],
        request.get("pandoc") or "",
        request.get("node") or "",
        request.get("libreofficeCli") or "",
        dpi,
    )

    rendered: list[dict] = []
    for index, item in enumerate(items):
        identifier = str(item.get("id") or index)
        latex = item.get("latex") or ""
        png = None
        if images and identifier in images:
            png = base64.b64encode(images[identifier]).decode("ascii")
        rendered.append({
            "id": identifier,
            "latex": latex,
            "read": latex_to_readable(latex),
            "alt": item.get("alt") or latex_to_spoken(latex),
            "png": png,
        })
    return {
        "ok": True,
        "items": rendered,
        "rasterised": bool(images),
        "hint": None if images else "Formula images need pandoc plus the bundled LibreOffice kit; plain readings are still available.",
    }


def write(payload: dict) -> None:
    """Always emit UTF-8 bytes, whatever the console code page is."""
    data = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def main() -> None:
    raw = sys.stdin.buffer.read().decode("utf-8", "replace")
    try:
        request = json.loads(raw or "{}")
    except Exception as error:
        write({"ok": False, "code": "BAD_REQUEST", "message": str(error)})
        return
    try:
        write(dispatch(request))
    except Exception as error:
        write({"ok": False, "code": "MATH_FAILED", "message": f"{type(error).__name__}: {error}"})


if __name__ == "__main__":
    main()
