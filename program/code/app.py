import sys
import subprocess
import os
from pathlib import Path
import webbrowser
import time
from threading import Timer, Thread
from flask import Flask, render_template, jsonify, request
from paths import ensure_dirs, safe_dataset_name, get_txt_path, get_sqlite_path, FILES_DIR
from importer import read_text_file, clean_lines, overwrite_cleaned_file, build_segments, get_hwp_text
from db import init_db, reset_segments, insert_segments, set_meta, list_datasets, connect_db
from search import search_segments

if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB

# Ensure necessary directories exist on startup
ensure_dirs()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload")
def upload():
    return render_template("upload.html")

@app.post("/api/upload")
def upload_file():
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "No file uploaded"}), 400

    file = request.files["file"]

    if not file.filename:
        return jsonify({"ok": False, "error": "Empty filename"}), 400

    filename_lower = file.filename.lower()
    if not (filename_lower.endswith(".txt") or filename_lower.endswith(".hwp")):
        return jsonify({"ok": False, "error": "텍스트(.txt) 또는 한글(.hwp) 파일만 업로드할 수 있습니다."}), 400

    dataset_name = safe_dataset_name(file.filename)
    txt_path = get_txt_path(dataset_name)

    is_hwp = filename_lower.endswith(".hwp")
    hwp_path = None

    try:
        if is_hwp:
            hwp_path = FILES_DIR / f"{dataset_name}.hwp"
            file.save(hwp_path)
            try:
                raw_text = get_hwp_text(hwp_path)
            except Exception as e:
                if hwp_path.exists():
                    hwp_path.unlink()
                return jsonify({"ok": False, "error": f"한글 파일 처리 중 오류 발생: {str(e)}"}), 500
            
            txt_path.write_text(raw_text, encoding="utf-8")
        else:
            file.save(txt_path)

        raw_text = read_text_file(txt_path)
        lines = clean_lines(raw_text)
        
        if not lines:
            if is_hwp and hwp_path and hwp_path.exists():
                hwp_path.unlink()
            if txt_path.exists():
                txt_path.unlink()
            return jsonify({"ok": False, "error": "No valid lines found"}), 400
            
        overwrite_cleaned_file(txt_path, lines)
        segments = build_segments(lines)

        # Initialize SQLite DB
        init_db(dataset_name)
        reset_segments(dataset_name)
        insert_segments(dataset_name, segments)

        # Store metadata
        set_meta(dataset_name, "dataset_name", dataset_name)
        set_meta(dataset_name, "file_name", file.filename)
        set_meta(dataset_name, "file_path", str(txt_path))
        set_meta(dataset_name, "line_count", str(len(lines)))

        return jsonify({
            "ok": True,
            "dataset_name": dataset_name,
            "line_count": len(lines)
        })
    except Exception as e:
        if is_hwp and hwp_path and hwp_path.exists():
            hwp_path.unlink()
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/api/datasets")
def api_datasets():
    try:
        datasets = list_datasets()
        return jsonify({"ok": True, "datasets": datasets})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/search/<dataset_name>")
def search_view(dataset_name):
    # Ensure the database exists
    if not get_sqlite_path(dataset_name).exists():
        return "Dataset not found", 404
    return render_template("search.html", dataset_name=dataset_name)

@app.route("/api/search/<dataset_name>")
def api_search(dataset_name):
    if not get_sqlite_path(dataset_name).exists():
        return jsonify({"ok": False, "error": "Dataset not found"}), 404
        
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"ok": False, "error": "Empty query"}), 400

    try:
        results = search_segments(dataset_name, query)
        return jsonify({
            "ok": True,
            "query": query,
            "count": len(results),
            "results": results
        })
    except ValueError as ve:
        # Invalid search query syntax
        return jsonify({
            "ok": False,
            "error": "Invalid search query",
            "detail": str(ve)
        }), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/api/file/<dataset_name>")
def api_file(dataset_name):
    if not get_sqlite_path(dataset_name).exists():
        return jsonify({"ok": False, "error": "Dataset not found"}), 404

    try:
        conn = connect_db(dataset_name)
        rows = conn.execute("SELECT line_number, text FROM segments ORDER BY line_number ASC").fetchall()
        conn.close()

        lines = [
            {"line_number": row["line_number"], "text": row["text"]}
            for row in rows
        ]

        return jsonify({
            "ok": True,
            "dataset_name": dataset_name,
            "lines": lines
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

last_heartbeat_time = time.time()
first_heartbeat_received = False

def heartbeat_watchdog():
    global last_heartbeat_time, first_heartbeat_received
    # Grace period of 25 seconds for the browser to launch and load
    time.sleep(25)
    while True:
        time.sleep(2)
        now = time.time()
        if first_heartbeat_received:
            if now - last_heartbeat_time > 10:
                os._exit(0)
        else:
            if now - last_heartbeat_time > 35:
                os._exit(0)

@app.post("/api/heartbeat")
def heartbeat_route():
    global last_heartbeat_time, first_heartbeat_received
    last_heartbeat_time = time.time()
    first_heartbeat_received = True
    return jsonify({"ok": True})

def open_browser():
    webbrowser.open_new("http://127.0.0.1:5000/")

if __name__ == "__main__":
    if getattr(sys, 'frozen', False):
        # Package execution mode: run without debug, auto open browser
        watchdog = Thread(target=heartbeat_watchdog, daemon=True)
        watchdog.start()
        Timer(1.0, open_browser).start()
        app.run(host="127.0.0.1", port=5000, debug=False)
    else:
        # Development execution mode
        app.run(host="127.0.0.1", port=5000, debug=True)
