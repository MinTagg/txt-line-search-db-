from pathlib import Path
import re

import sys

if getattr(sys, 'frozen', False):
    PROGRAM_DIR = Path(sys.executable).resolve().parent
else:
    CODE_DIR = Path(__file__).resolve().parent
    PROGRAM_DIR = CODE_DIR.parent

DATA_ROOT_DIR = PROGRAM_DIR / "DB"
FILES_DIR = DATA_ROOT_DIR / "files"
SQLITE_ROOT_DIR = DATA_ROOT_DIR / "DB"

def ensure_dirs() -> None:
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    SQLITE_ROOT_DIR.mkdir(parents=True, exist_ok=True)

def safe_dataset_name(filename: str) -> str:
    name = Path(filename).stem
    name = re.sub(r"[^0-9A-Za-z가-힣_\-]+", "_", name)
    name = name.strip("_")
    if not name:
        name = "dataset"
    return name

def get_txt_path(dataset_name: str) -> Path:
    return FILES_DIR / f"{dataset_name}.txt"

def get_dataset_dir(dataset_name: str) -> Path:
    return SQLITE_ROOT_DIR / dataset_name

def get_sqlite_path(dataset_name: str) -> Path:
    return get_dataset_dir(dataset_name) / "data.sqlite"
