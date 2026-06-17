from pathlib import Path

def read_text_file(file_path: Path) -> str:
    encodings = ["utf-8", "utf-8-sig", "cp949"]

    last_error = None
    for enc in encodings:
        try:
            return file_path.read_text(encoding=enc)
        except UnicodeDecodeError as e:
            last_error = e

    raise UnicodeDecodeError(
        "unknown",
        b"",
        0,
        1,
        f"Unable to decode file: {last_error}"
    )

def clean_lines(raw_text: str) -> list[str]:
    return [
        line.strip()
        for line in raw_text.splitlines()
        if line.strip()
    ]

def overwrite_cleaned_file(file_path: Path, lines: list[str]) -> None:
    file_path.write_text("\n".join(lines), encoding="utf-8")

def make_preview(text: str, limit: int = 200) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "..."

def build_segments(lines: list[str]) -> list[dict]:
    segments = []

    for idx, line in enumerate(lines, start=1):
        segments.append({
            "line_number": idx,
            "text": line,
            "preview": make_preview(line)
        })

    return segments
