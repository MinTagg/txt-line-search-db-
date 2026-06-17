import sqlite3
from pathlib import Path
from paths import get_sqlite_path, get_dataset_dir, SQLITE_ROOT_DIR

def connect_db(dataset_name: str) -> sqlite3.Connection:
    db_path = get_sqlite_path(dataset_name)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(dataset_name: str) -> None:
    dataset_dir = get_dataset_dir(dataset_name)
    dataset_dir.mkdir(parents=True, exist_ok=True)

    conn = connect_db(dataset_name)
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        line_number INTEGER NOT NULL,
        text TEXT NOT NULL,
        preview TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS dataset_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_segments_line_number
    ON segments(line_number);
    """)

    conn.commit()
    conn.close()

def reset_segments(dataset_name: str) -> None:
    conn = connect_db(dataset_name)
    cur = conn.cursor()
    cur.execute("DELETE FROM segments;")
    conn.commit()
    conn.close()

def insert_segments(dataset_name: str, segments: list[dict]) -> None:
    conn = connect_db(dataset_name)
    cur = conn.cursor()

    cur.executemany(
        """
        INSERT INTO segments (line_number, text, preview)
        VALUES (?, ?, ?)
        """,
        [
            (
                item["line_number"],
                item["text"],
                item["preview"]
            )
            for item in segments
        ]
    )

    conn.commit()
    conn.close()

def set_meta(dataset_name: str, key: str, value: str) -> None:
    conn = connect_db(dataset_name)
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO dataset_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, value)
    )

    conn.commit()
    conn.close()

def list_datasets() -> list[str]:
    if not SQLITE_ROOT_DIR.exists():
        return []

    datasets = []
    for path in SQLITE_ROOT_DIR.iterdir():
        if path.is_dir() and (path / "data.sqlite").exists():
            datasets.append(path.name)

    return sorted(datasets)
