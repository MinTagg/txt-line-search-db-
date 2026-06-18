import sys
import subprocess
import os
import webbrowser
from threading import Timer
from flask import Flask, render_template, jsonify, request
from paths import ensure_dirs, safe_dataset_name, get_txt_path, get_sqlite_path, FILES_DIR
from importer import read_text_file, clean_lines, overwrite_cleaned_file, build_segments
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
        return jsonify({"ok": False, "error": ".txt 또는 .hwp 파일만 업로드할 수 있습니다."}), 400

    dataset_name = safe_dataset_name(file.filename)
    txt_path = get_txt_path(dataset_name)

    if filename_lower.endswith(".hwp"):
        hwp_path = FILES_DIR / f"{dataset_name}.hwp"
        file.save(hwp_path)

        try:
            result = subprocess.run(
                ["hwp5txt", "--output", str(txt_path), str(hwp_path)],
                capture_output=True,
                text=True,
                timeout=120
            )
            if result.returncode != 0:
                raise RuntimeError(f"hwp5txt 변환 실패: {result.stderr}")
        except FileNotFoundError:
            return jsonify({"ok": False, "error": "hwp5txt 명령어를 찾을 수 없습니다. pyhwp가 설치되었는지 확인하세요."}), 500
        except subprocess.TimeoutExpired:
            return jsonify({"ok": False, "error": "HWP 변환 시간이 초과되었습니다."}), 500
        finally:
            if hwp_path.exists():
                hwp_path.unlink()
    else:
        file.save(txt_path)

    try:
        raw_text = read_text_file(txt_path)
        lines = clean_lines(raw_text)
        
        if not lines:
            return jsonify({"ok": False, "error": "No valid lines found"}), 400
            
        overwrite_cleaned_file(txt_path, lines)
        segments = build_segments(lines)

        # Initialize SQLite DB
        init_db(dataset_name)
        reset_segments(dataset_name)
        insert_segments(dataset_name, segments)

        # Store metadata
        set_meta(dataset_name, "dataset_name", dataset_name)
        set_meta(dataset_name, "file_name", f"{dataset_name}.txt")
        set_meta(dataset_name, "file_path", str(txt_path))
        set_meta(dataset_name, "line_count", str(len(lines)))

        return jsonify({
            "ok": True,
            "dataset_name": dataset_name,
            "line_count": len(lines)
        })
    except Exception as e:
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

def open_browser():
    webbrowser.open_new("http://127.0.0.1:5000/")

if __name__ == "__main__":
    if getattr(sys, 'frozen', False):
        # Package execution mode: run without debug, auto open browser
        Timer(1.0, open_browser).start()
        app.run(host="127.0.0.1", port=5000, debug=False)
    else:
        # Development execution mode
        app.run(host="127.0.0.1", port=5000, debug=True)
