# TXT Line Search DB — 구현 상세 계획서

> **문서 목적**: `docs/README.md` 명세서를 기반으로, 이 문서만 보고 바로 코딩에 착수할 수 있도록 모든 사전 조사와 설계 결정을 정리한다.

---

## 1. 프로젝트 현황 조사 결과

### 1.1 환경

| 항목 | 값 |
|------|-----|
| Python 버전 | 3.11 (`.python-version`) |
| 패키지 관리 | uv (`pyproject.toml` + `uv.lock`) |
| 현재 의존성 | `ipykernel>=7.3.0` (Jupyter 용도, 본 프로그램과 무관) |
| Flask | **미설치** — `uv add flask` 필요 |
| OS | macOS |

### 1.2 폴더 현황

```
kjj/
├── docs/
│   ├── README.md          ← 명세서 (2961줄)
│   └── plan.md            ← 이 문서
├── program/
│   ├── code/              ← 비어 있음 (여기에 구현)
│   └── DB/
│       ├── DB/
│       │   ├── sample_1/  ← 비어 있음 (sqlite 없음)
│       │   └── sample_2/  ← 비어 있음 (sqlite 없음)
│       └── files/
│           ├── sample_1.txt  (49B, 빈 줄 포함, 미전처리 상태)
│           └── sample_2.txt  (38B, 빈 줄 없음)
├── pyproject.toml
├── uv.lock
├── main.py                ← 기본 스켈레톤, 사용하지 않음
├── lab.ipynb
├── .python-version
├── .gitignore
└── 주자어류.1-140권.저본중화서국1994.박성규 교.최종본.txt  (5.9MB, 실제 데이터)
```

### 1.3 기존 샘플 데이터 내용

**sample_1.txt** (빈 줄 포함 → 전처리 필요):
```
ABCD

EFGH

IJKLABC
```

**sample_2.txt** (빈 줄 없음):
```
ABCD
EFGH
IJKLABC
```

> 두 파일 모두 DB 폴더(`sample_1/`, `sample_2/`)는 존재하지만 `data.sqlite`는 아직 없다.
> 업로드 기능 구현 후 이 파일들로 테스트할 수 있다.

### 1.4 실제 대용량 데이터

루트에 `주자어류.1-140권.저본중화서국1994.박성규 교.최종본.txt` (5.9MB)가 있다. 이 파일이 실제 운영 데이터로 추정된다. MVP 완성 후 이 파일로 성능 검증이 가능하다.

---

## 2. 구현 전 사전 작업

구현 코드를 작성하기 전에 반드시 수행해야 하는 환경 준비 작업이다.

### 2.1 Flask 의존성 추가

```bash
cd /Users/mt/MT/project/kjj
uv add flask
```

이 명령 하나로 `pyproject.toml`에 flask가 추가되고, `uv.lock`이 갱신된다.

### 2.2 .gitignore 업데이트

현재 `.gitignore`에 SQLite DB 파일과 업로드 파일에 대한 규칙이 없다. 필요시 추가:

```gitignore
# DB 파일 (용량이 클 수 있음)
program/DB/DB/**/*.sqlite
program/DB/files/*.txt
```

> 이 부분은 선택사항이다. 샘플 데이터를 Git에 포함할지 여부에 따라 결정한다.

---

## 3. 최종 폴더 구조 (구현 후)

```
program/
├── code/
│   ├── app.py              ← Flask 진입점
│   ├── paths.py            ← 경로 관리
│   ├── importer.py         ← txt 전처리
│   ├── db.py               ← SQLite 관리
│   ├── query_parser.py     ← 검색식 파서
│   ├── search.py           ← 검색 실행
│   ├── templates/
│   │   ├── index.html      ← 첫 페이지
│   │   ├── upload.html     ← 업로드 페이지
│   │   └── search.html     ← 검색 페이지
│   └── static/
│       ├── style.css       ← 전체 스타일
│       └── app.js          ← 프론트엔드 로직
└── DB/
    ├── DB/                 ← 데이터셋별 SQLite
    └── files/              ← 전처리된 txt 파일
```

총 생성 파일: **11개**

---

## 4. Phase별 상세 구현 명세

---

### Phase 1. 프로젝트 골격 생성

**목표**: Flask 앱이 실행되고, 브라우저에서 첫 페이지가 열린다.

#### 생성 파일 4개

**① `paths.py`**

| 항목 | 내용 |
|------|------|
| 역할 | 프로젝트 내 모든 경로를 중앙 관리 |
| 상수 | `CODE_DIR`, `PROGRAM_DIR`, `DATA_ROOT_DIR`, `FILES_DIR`, `SQLITE_ROOT_DIR` |
| 함수 | `ensure_dirs()`, `safe_dataset_name(filename)`, `get_txt_path(name)`, `get_dataset_dir(name)`, `get_sqlite_path(name)` |

경로 계산 기준:
```
CODE_DIR     = Path(__file__).resolve().parent          → program/code/
PROGRAM_DIR  = CODE_DIR.parent                          → program/
DATA_ROOT_DIR = PROGRAM_DIR / "DB"                      → program/DB/
FILES_DIR    = DATA_ROOT_DIR / "files"                  → program/DB/files/
SQLITE_ROOT_DIR = DATA_ROOT_DIR / "DB"                  → program/DB/DB/
```

`safe_dataset_name` 규칙:
- 확장자 제거 (`Path.stem`)
- 허용 문자: `[0-9A-Za-z가-힣_\-]`
- 나머지는 `_`로 치환
- 양쪽 `_` 제거
- 빈 문자열이면 `"dataset"`

**② `app.py`**

| 항목 | 내용 |
|------|------|
| 역할 | Flask 앱 생성, 라우트 등록, 서버 실행 |
| Phase 1 라우트 | `GET /` → `index.html` 렌더링 |
| 실행 | `if __name__ == "__main__": app.run(debug=True)` |
| 초기화 | `ensure_dirs()` 호출 |

**③ `templates/index.html`**

| 항목 | 내용 |
|------|------|
| 구조 | 제목 "TXT Line Search DB" + 버튼 2개 |
| 버튼 1 | `새 데이터 업로드` → `/upload` 이동 |
| 버튼 2 | `기존 데이터 이용` → `/datasets` 이동 (또는 JS로 목록 로드) |

**④ `static/style.css`**

| 항목 | 내용 |
|------|------|
| 기본 설정 | `margin: 0`, `system-ui` 폰트, `background: #f6f6f6` |
| 레이아웃 | 페이지 중앙 정렬, 버튼 스타일 |
| 이후 Phase에서 검색 페이지 스타일을 계속 추가 |

#### 완료 기준

```
python program/code/app.py 실행 → http://localhost:5000 접속 → 첫 페이지 표시
```

---

### Phase 2. 파일 업로드 구현

**목표**: 브라우저에서 txt 파일을 업로드하면 `program/DB/files/`에 저장된다.

#### 생성/수정 파일

**① `templates/upload.html` [NEW]**

3가지 UI 상태:
| 상태 | 표시 내용 |
|------|-----------|
| 초기 | 파일 선택 input + 업로드 버튼 |
| 처리 중 | "데이터 처리중..." 메시지 |
| 완료 | "완료되었습니다." + 완료 버튼 → `/` 이동 |

JavaScript로 `POST /api/upload` 호출 (`FormData` + `fetch`).

**② `app.py` [MODIFY]**

추가 라우트:
| 메서드 | 경로 | 동작 |
|--------|------|------|
| `GET` | `/upload` | `upload.html` 렌더링 |
| `POST` | `/api/upload` | 파일 수신 → 저장 |

`POST /api/upload` 처리 순서:
1. `request.files`에 `file` 키 확인
2. `filename` 존재 확인
3. `.txt` 확장자 확인
4. `safe_dataset_name()` 생성
5. `program/DB/files/{name}.txt`에 저장
6. (Phase 3에서 전처리 연결)
7. 성공 JSON 반환

에러 응답:
| 조건 | 응답 |
|------|------|
| 파일 없음 | `{"ok": false, "error": "No file uploaded"}` (400) |
| 파일명 없음 | `{"ok": false, "error": "Empty filename"}` (400) |
| txt 아님 | `{"ok": false, "error": "Only .txt files are allowed"}` (400) |

Flask 설정:
```python
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB
```

#### 완료 기준

```
sample_1.txt 업로드 → program/DB/files/sample_1.txt 생성 확인
.pdf 업로드 → 에러 응답 확인
```

---

### Phase 3. txt 전처리 구현

**목표**: 업로드된 파일에서 빈 줄 제거 → 양쪽 공백 제거 → 같은 파일에 덮어쓰기 → segment 리스트 생성

#### 생성 파일

**① `importer.py` [NEW]**

| 함수 | 입력 | 출력 | 동작 |
|------|------|------|------|
| `read_text_file(path)` | Path | str | UTF-8-sig → cp949 fallback 읽기 |
| `clean_lines(raw_text)` | str | list[str] | `line.strip()`이 비어 있으면 제거, 양쪽 공백 strip |
| `overwrite_cleaned_file(path, lines)` | Path, list[str] | None | `"\n".join(lines)` → UTF-8로 저장 |
| `make_preview(text, limit=200)` | str, int | str | 200자 초과 시 `text[:200] + "..."` |
| `build_segments(lines)` | list[str] | list[dict] | `[{line_number: 1, text: ..., preview: ...}, ...]` |

인코딩 처리 순서: `utf-8` → `utf-8-sig` → `cp949`

**② `app.py` [MODIFY]**

`POST /api/upload`에 전처리 연결:
```
file.save(txt_path)
→ raw_text = read_text_file(txt_path)
→ lines = clean_lines(raw_text)
→ lines가 비어 있으면 에러: {"ok": false, "error": "No valid lines found"}
→ overwrite_cleaned_file(txt_path, lines)
→ segments = build_segments(lines)
→ (Phase 4에서 DB 저장 연결)
```

#### 완료 기준

```
빈 줄 포함 파일 업로드 → program/DB/files/에 빈 줄이 제거된 파일 저장 확인
빈 줄만 있는 파일 → "No valid lines found" 에러 확인
```

---

### Phase 4. SQLite DB화 구현

**목표**: 전처리된 줄 데이터를 데이터셋별 SQLite DB에 저장한다.

#### 생성 파일

**① `db.py` [NEW]**

| 함수 | 동작 |
|------|------|
| `connect_db(name)` | `get_sqlite_path(name)`으로 연결, `row_factory = sqlite3.Row` |
| `init_db(name)` | 폴더 생성 + `segments` 테이블 + `dataset_meta` 테이블 + 인덱스 생성 |
| `reset_segments(name)` | `DELETE FROM segments` |
| `insert_segments(name, segments)` | `executemany` bulk insert |
| `set_meta(name, key, value)` | `INSERT ... ON CONFLICT DO UPDATE` |
| `list_datasets()` | `SQLITE_ROOT_DIR` 순회 → `data.sqlite`가 있는 폴더명 리스트 |

테이블 스키마:

```sql
-- segments
CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    preview TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_segments_line_number ON segments(line_number);

-- dataset_meta
CREATE TABLE IF NOT EXISTS dataset_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

메타데이터 저장 항목:
| key | 값 예시 |
|-----|---------|
| `dataset_name` | `sample_1` |
| `file_name` | `sample_1.txt` |
| `file_path` | `program/DB/files/sample_1.txt` |
| `line_count` | `1000` |

**② `app.py` [MODIFY]**

`POST /api/upload`에 DB 저장 연결:
```
→ init_db(dataset_name)
→ reset_segments(dataset_name)
→ insert_segments(dataset_name, segments)
→ set_meta(dataset_name, "dataset_name", dataset_name)
→ set_meta(dataset_name, "file_name", f"{dataset_name}.txt")
→ set_meta(dataset_name, "file_path", str(txt_path))
→ set_meta(dataset_name, "line_count", str(len(lines)))
→ return {"ok": true, "dataset_name": ..., "line_count": ...}
```

#### 완료 기준

```
업로드 완료 후 program/DB/DB/{name}/data.sqlite 생성 확인
sqlite3로 열어서 segments 테이블에 line_number + text 확인
```

---

### Phase 5. 기존 데이터 목록 구현

**목표**: DB화된 데이터셋 목록을 표시하고, 선택 시 검색 페이지로 이동한다.

#### 수정 파일

**① `app.py` [MODIFY]**

추가 라우트:
| 메서드 | 경로 | 동작 |
|--------|------|------|
| `GET` | `/datasets` | `index.html` 렌더링 (목록 모드) |
| `GET` | `/api/datasets` | `db.list_datasets()` → JSON |

`/api/datasets` 응답:
```json
{"ok": true, "datasets": ["sample_1", "sample_2"]}
```

**② `templates/index.html` [MODIFY]**

`기존 데이터 이용` 클릭 시:
- `/api/datasets` 호출
- 목록 동적 렌더링
- 데이터셋 클릭 → `/search/{dataset_name}` 이동
- 목록이 비어 있으면 "등록된 데이터가 없습니다." 표시

#### 완료 기준

```
파일 업로드 후 → 기존 데이터 이용 클릭 → 데이터셋 이름 표시 → 클릭 → 검색 페이지 이동
```

---

### Phase 6. 검색 쿼리 파서 구현

**목표**: 검색식 문자열을 SQL WHERE 조건으로 변환한다.

> 이 Phase는 다른 Phase와 독립적이므로 병렬 진행 가능하다.

#### 생성 파일

**① `query_parser.py` [NEW]**

**클래스/함수 목록:**

| 구성요소 | 역할 |
|----------|------|
| `Token(type, value)` | 토큰 dataclass. type: `TERM`, `AND`, `OR`, `LPAREN`, `RPAREN`, `EOF` |
| `TermNode(value)` | AST 리프 노드 |
| `BinaryNode(op, left, right)` | AST 이항 연산 노드 |
| `tokenize(query)` | 문자열 → 토큰 리스트 |
| `Parser(tokens)` | Recursive descent parser |
| `escape_like(term)` | LIKE 특수문자 이스케이프 |
| `compile_to_sql(node)` | AST → `(sql_str, params_list)` |
| `parse_query_to_sql(query)` | 통합 변환 함수 |

**Tokenizer 규칙 (우선순위순):**

1. 공백 → 건너뛰기
2. `(` → `LPAREN`
3. `)` → `RPAREN`
4. `&` → `AND`
5. `and` (문자열 매칭) → `AND`
6. `or` (문자열 매칭) → `OR`
7. 나머지 연속 문자 → `TERM` (공백 strip)
8. 마지막에 `EOF` 토큰 추가

**Parser Grammar:**

```
expression := or_expr
or_expr    := and_expr ("or" and_expr)*
and_expr   := primary (("and" | "&") primary)*
primary    := TERM | "(" expression ")"
```

연산자 우선순위: `()` > `and`/`&` > `or`

**SQL 변환 규칙:**

| AST 노드 | SQL 출력 | 파라미터 |
|-----------|----------|----------|
| `TermNode("가나다")` | `text LIKE ? ESCAPE '\'` | `["%가나다%"]` |
| `BinaryNode("AND", L, R)` | `(L_sql AND R_sql)` | `L_params + R_params` |
| `BinaryNode("OR", L, R)` | `(L_sql OR R_sql)` | `L_params + R_params` |

**`escape_like()` 처리:**

```
\ → \\
% → \%
_ → \_
```

**에러 케이스:**

| 입력 | 에러 |
|------|------|
| 빈 문자열 | `"검색어가 비어 있습니다."` |
| `가나다and` | `"Unexpected token: EOF"` (primary에서 TERM도 LPAREN도 아닌 EOF) |
| `and가나다` | `"Unexpected token: AND"` (primary에서 AND를 만남) |
| `(가나다and라마` | `"Expected RPAREN, got EOF"` |
| `()` | `"Unexpected token: RPAREN"` (primary에서 RPAREN을 만남) |
| `가나다andor라마` | `"Unexpected token: OR"` (primary에서 OR을 만남) |

#### 변환 예시

| 입력 | WHERE 절 | 파라미터 |
|------|----------|----------|
| `가나다` | `text LIKE ? ESCAPE '\'` | `["%가나다%"]` |
| `가나다and라마` | `(text LIKE ? ESCAPE '\' AND text LIKE ? ESCAPE '\')` | `["%가나다%", "%라마%"]` |
| `가나다&라마` | (위와 동일) | (위와 동일) |
| `가나다or라마` | `(text LIKE ? ESCAPE '\' OR text LIKE ? ESCAPE '\')` | `["%가나다%", "%라마%"]` |
| `(가나다and라마)or사아` | `((text LIKE ? ESCAPE '\' AND text LIKE ? ESCAPE '\') OR text LIKE ? ESCAPE '\')` | `["%가나다%", "%라마%", "%사아%"]` |

#### 완료 기준

```
위 변환 예시가 모두 정확히 동작
에러 케이스에서 ValueError 발생
```

---

### Phase 7. 검색 API 구현

**목표**: 검색 쿼리를 받아 DB에서 검색하고 JSON으로 반환한다.

#### 생성/수정 파일

**① `search.py` [NEW]**

| 함수 | 동작 |
|------|------|
| `search_segments(dataset_name, query)` | `parse_query_to_sql` → SQL 실행 → 결과 딕셔너리 리스트 |

SQL:
```sql
SELECT id, line_number, text, preview
FROM segments
WHERE {where_sql}
ORDER BY line_number ASC
```

반환 형식:
```python
[{"id": 1, "line_number": 10, "text": "...", "preview": "..."}, ...]
```

**② `app.py` [MODIFY]**

추가 라우트:

| 메서드 | 경로 | 동작 |
|--------|------|------|
| `GET` | `/search/<dataset_name>` | `search.html` 렌더링 |
| `GET` | `/api/search/<dataset_name>?q=...` | 검색 실행 → JSON |
| `GET` | `/api/file/<dataset_name>` | txt 파일 줄 단위 JSON |

`/api/search` 성공 응답:
```json
{"ok": true, "query": "...", "count": 2, "results": [...]}
```

`/api/search` 에러 응답:
```json
{"ok": false, "error": "Invalid search query", "detail": "..."}
```

`/api/file` 응답:
```json
{"ok": true, "dataset_name": "...", "lines": [{"line_number": 1, "text": "..."}, ...]}
```

`/api/file` 처리:
- `get_txt_path(dataset_name)` → 파일 읽기 → 줄 분리 → `enumerate(lines, 1)`

#### 완료 기준

```
GET /api/search/sample_1?q=ABC → 조건에 맞는 줄 JSON 반환
GET /api/file/sample_1 → 전체 줄 JSON 반환
잘못된 검색식 → 에러 JSON 반환
```

---

### Phase 8. 검색 페이지 UI 구현

**목표**: 검색창 + 검색 결과 + 사이드 패널 + 원문 표시 영역을 포함한 검색 페이지를 완성한다.

#### 생성/수정 파일

**① `templates/search.html` [NEW]**

HTML 구조:
```
<div class="app-shell">
    <div class="side-panel">
        <a class="home-button" href="/">홈</a>
    </div>
    <div class="main-split">
        <div class="left-pane" id="left-pane">
            <div class="search-bar">
                <input id="search-input" placeholder="검색어 입력">
                <button id="search-button" disabled>검색</button>
            </div>
            <div class="results" id="results"></div>
        </div>
        <div class="resizer" id="resizer"></div>
        <div class="right-pane" id="right-pane">
            <div class="file-viewer" id="file-viewer"></div>
        </div>
    </div>
</div>
```

Jinja2로 `dataset_name`을 JS 변수로 전달:
```html
<script>const datasetName = "{{ dataset_name }}";</script>
<script src="/static/app.js"></script>
```

**② `static/app.js` [NEW]**

| 함수/기능 | 동작 |
|-----------|------|
| 검색 버튼 활성화 | `input` 이벤트 → 값 비어 있으면 disabled |
| `runSearch()` | `fetch(/api/search/...)` → `renderResults()` |
| `renderResults(results)` | 결과 블록 생성 → 클릭 이벤트 바인딩 |
| `loadFile()` | `fetch(/api/file/...)` → 오른쪽 영역에 줄 렌더링 |
| `scrollToLine(n)` | `scrollIntoView({ behavior: "smooth", block: "center" })` + highlight |
| `escapeHtml(value)` | `& < > " '` 이스케이프 |
| Enter 키 검색 | `keydown` 이벤트 → Enter 시 `runSearch()` |
| Resizer 드래그 | `mousedown/mousemove/mouseup` → 좌측 폭 조절 (최소 300px) |
| 페이지 로드 시 | `loadFile()` 자동 호출 |

**③ `static/style.css` [MODIFY]**

추가할 CSS 영역:

| 셀렉터 | 역할 |
|--------|------|
| `.app-shell` | `display: flex; height: 100vh; width: 100vw; overflow: hidden;` |
| `.side-panel` | `width: 56px; background: #111; color: #fff;` 세로 패널 |
| `.home-button` | `writing-mode: vertical-rl;` 세로 텍스트 |
| `.main-split` | `flex: 1; display: flex;` |
| `.left-pane` | `width: 50%; min-width: 300px;` |
| `.right-pane` | `flex: 1; min-width: 300px; overflow-y: auto;` |
| `.resizer` | `width: 6px; cursor: col-resize; background: #ddd;` |
| `.search-bar` | 검색창 + 버튼 레이아웃 |
| `.result-block` | 검색 결과 블록 카드 |
| `.result-preview` | `-webkit-line-clamp: 3` 축약 |
| `.file-viewer` | 모노스페이스 폰트 |
| `.line` | `white-space: pre-wrap;` |
| `.line.highlight` | `background: #fff3a3;` 하이라이트 |

#### 완료 기준

```
검색 페이지 진입 → 오른쪽에 원문 표시
검색어 입력 → 결과 블록 표시
결과 클릭 → 해당 줄로 스크롤 + 하이라이트
홈 버튼 → 첫 페이지 이동
Resizer 드래그 → 좌우 비율 조절
```

---

## 5. 전체 라우트 맵

| 메서드 | 경로 | 응답 | Phase |
|--------|------|------|-------|
| `GET` | `/` | index.html | 1 |
| `GET` | `/upload` | upload.html | 2 |
| `POST` | `/api/upload` | JSON | 2-4 |
| `GET` | `/datasets` | index.html (목록 모드) | 5 |
| `GET` | `/api/datasets` | JSON | 5 |
| `GET` | `/search/<name>` | search.html | 7 |
| `GET` | `/api/file/<name>` | JSON | 7 |
| `GET` | `/api/search/<name>?q=...` | JSON | 7 |

---

## 6. 파일 생성 순서

| 순서 | 파일 | Phase | 의존 |
|------|------|-------|------|
| 1 | `paths.py` | 1 | 없음 |
| 2 | `static/style.css` | 1 | 없음 |
| 3 | `templates/index.html` | 1 | style.css |
| 4 | `app.py` | 1 | paths.py |
| 5 | `templates/upload.html` | 2 | style.css |
| 6 | `importer.py` | 3 | 없음 |
| 7 | `db.py` | 4 | paths.py |
| 8 | `query_parser.py` | 6 | 없음 (독립) |
| 9 | `search.py` | 7 | db.py, query_parser.py |
| 10 | `templates/search.html` | 8 | style.css |
| 11 | `static/app.js` | 8 | 없음 |

---

## 7. Phase 의존 관계도

```
Phase 1 (골격)
  └─ Phase 2 (업로드)
       └─ Phase 3 (전처리)
            └─ Phase 4 (DB화)
                 ├─ Phase 5 (목록)
                 └─────────────────┐
                                   ▼
Phase 6 (쿼리 파서, 독립) ──→ Phase 7 (검색 API)
                                   └─ Phase 8 (검색 UI + 원문 + Resizer)
```

---

## 8. 보안 체크리스트

| # | 항목 | 구현 위치 | 방법 |
|---|------|-----------|------|
| 1 | 파일명 안전 처리 | `paths.safe_dataset_name()` | 정규식으로 허용 문자만 남김 |
| 2 | 경로 이탈 방지 | `paths.py` | 모든 경로를 `FILES_DIR`, `SQLITE_ROOT_DIR` 하위로 제한 |
| 3 | SQL Injection 방지 | `query_parser.compile_to_sql()` | parameter binding (`?`) 사용 |
| 4 | HTML Injection 방지 | `app.js` → `escapeHtml()` | `& < > " '` 이스케이프 |
| 5 | 파일 크기 제한 | `app.py` | `MAX_CONTENT_LENGTH = 20MB` |

---

## 9. 검증 시나리오

### 9.1 업로드 검증

| # | 입력 | 기대 결과 |
|---|------|-----------|
| 1 | 빈 줄 포함 txt | 빈 줄 제거 후 저장, DB에 line_number 정상 |
| 2 | `.pdf` 파일 | `"Only .txt files are allowed"` 에러 |
| 3 | cp949 인코딩 txt | UTF-8로 변환 저장 |
| 4 | 빈 줄만 있는 txt | `"No valid lines found"` 에러 |
| 5 | 파일 미선택 | `"No file uploaded"` 에러 |

### 9.2 검색 검증

| # | 검색식 | 기대 SQL 동작 |
|---|--------|---------------|
| 1 | `가나다and라마` | 두 키워드 모두 포함된 줄 |
| 2 | `가나다&라마` | 위와 동일 |
| 3 | `가나다or라마` | 어느 한쪽이라도 포함된 줄 |
| 4 | `(가나다and라마)or사아` | AND 그룹 또는 사아 포함 줄 |
| 5 | `가나다or라마and사아` | `가나다 OR (라마 AND 사아)` — and 우선 |
| 6 | `가나다and` | ValueError |
| 7 | `()` | ValueError |
| 8 | `(가나다and라마` | ValueError |

### 9.3 UI 검증

| # | 동작 | 기대 결과 |
|---|------|-----------|
| 1 | 검색 결과 클릭 | 오른쪽 원문이 해당 줄로 스크롤, 1.5초 하이라이트 |
| 2 | Resizer 드래그 | 좌우 비율 조절, 최소 300px 제한 |
| 3 | 홈 버튼 클릭 | 첫 페이지로 이동 |
| 4 | 빈 검색창 | 검색 버튼 비활성화 |
| 5 | Enter 키 | 검색 실행 |
| 6 | 검색 결과 없음 | "검색 결과가 없습니다." 메시지 |

### 9.4 대용량 테스트 (MVP 후)

`주자어류.1-140권.저본중화서국1994.박성규 교.최종본.txt` (5.9MB)를 업로드하여:
- 업로드 + 전처리 + DB화 정상 완료 확인
- 검색 응답 시간 확인
- 오른쪽 원문 렌더링 성능 확인

---

## 10. 실행 방법 (구현 완료 후)

```bash
# 1. Flask 설치 (최초 1회)
cd /Users/mt/MT/project/kjj
uv add flask

# 2. 서버 실행
cd program/code
uv run python app.py

# 3. 브라우저 접속
# http://localhost:5000
```
