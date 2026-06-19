import unicodedata
from pathlib import Path
import olefile
import zlib
import struct

def get_hwp_text(filename: Path | str) -> str:
    """
    HWP 파일에서 본문 텍스트를 추출한다.
    """
    hwp_file = olefile.OleFileIO(str(filename))
    try:
        dirs = hwp_file.listdir()

        # HWP 파일 구조 검증
        if ["FileHeader"] not in dirs or ["\x05HwpSummaryInformation"] not in dirs:
            raise ValueError("올바른 HWP 파일 구조가 아닙니다.")

        # 압축 여부 확인
        header = hwp_file.openstream("FileHeader")
        header_data = header.read()
        if len(header_data) <= 36:
            raise ValueError("FileHeader 데이터가 올바르지 않습니다.")
        is_compressed = (header_data[36] & 1) == 1

        # BodyText/Section 목록 수집
        section_numbers = []
        for item in dirs:
            if len(item) >= 2 and item[0] == "BodyText" and item[1].startswith("Section"):
                try:
                    section_number = int(item[1][7:])
                    section_numbers.append(section_number)
                except ValueError:
                    pass

        sections = [
            "BodyText/Section" + str(number)
            for number in sorted(section_numbers)
        ]

        text = ""
        for section in sections:
            bodytext = hwp_file.openstream(section)
            data = bodytext.read()

            # 압축 해제
            if is_compressed:
                unpacked_data = zlib.decompress(data, -15)
            else:
                unpacked_data = data

            section_text = ""
            offset = 0
            size = len(unpacked_data)

            while offset + 4 <= size:
                record_header = struct.unpack_from("<I", unpacked_data, offset)[0]
                record_type = record_header & 0x3ff
                record_length = (record_header >> 20) & 0xfff

                if offset + 4 + record_length > size:
                    break

                # 텍스트 레코드 추출 (67)
                if record_type == 67:
                    record_data = unpacked_data[offset + 4:offset + 4 + record_length]
                    section_text += record_data.decode("utf-16", errors="ignore")
                    section_text += "\n"

                offset += 4 + record_length

            text += section_text
            text += "\n"

        return text
    finally:
        hwp_file.close()


def read_text_file(file_path: Path) -> str:
    encodings = ["utf-8-sig", "utf-8", "cp949"]

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
        unicodedata.normalize('NFKC', line.strip())
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
