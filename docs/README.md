# TXT Line Search DB Program 개발 문서

## 0. 문서 목적

이 문서는 `txt` 파일을 업로드한 뒤, 파일을 줄 단위로 분리하여 SQLite DB에 저장하고, 사용자가 입력한 `and / or / () / &` 기반 검색식으로 줄 단위 검색을 수행하는 웹 프로그램의 개발 명세서이다.

이 문서만 보고도 다음 작업을 바로 진행할 수 있어야 한다.

* 프로젝트 폴더 구조 생성
* 파일 업로드 기능 구현
* txt 파일 전처리
* 줄 단위 DB화
* SQLite 스키마 작성
* 검색 쿼리 파서 구현
* 검색 API 구현
* 브라우저 기반 UI 구현
* 검색 결과 클릭 시 원문 위치 이동 구현

---

# 1. 프로젝트 기본 원칙

## 1.1 저장 위치 원칙

모든 실행 프로그램, 코드, 데이터, DB, 업로드 파일은 반드시 `program/` 폴더 안에 저장한다.

`docs/` 폴더는 개발 문서, 설계 문서, 프롬프트, 구현 가이드, 사용 설명서 등을 저장하는 용도로만 사용한다.

```txt
.
├── docs
│   └── READMD.md
└── program
    ├── code
    └── DB
        ├── DB
        │   ├── sample_1
        │   └── sample_2
        └── files
            ├── sample_1.txt
            └── sample_2.txt
```

## 1.2 프로그램 목적

이 프로그램의 목적은 다음과 같다.

```txt
txt 파일 업로드
→ txt 파일 전처리
→ 줄 단위 slicing
→ SQLite DB화
→ 검색식 기반 검색
→ 검색 결과를 웹 브라우저에 표시
→ 검색 결과 클릭 시 원문 위치로 이동
```

## 1.3 핵심 전제

이 프로젝트의 검색 단위는 **문장 단위가 아니라 줄 단위**이다.

즉, txt 파일이 다음과 같다면:

```txt
abc
def
ghi
```

DB에는 다음과 같이 저장된다.

```txt
1번 줄: abc
2번 줄: def
3번 줄: ghi
```

각 줄은 하나의 독립적인 검색 대상이다.

---

# 2. 확정된 요구사항

## 2.1 파일 처리 요구사항

사용자는 웹 브라우저에서 txt 파일을 업로드한다.

업로드된 파일은 다음 경로에 저장된다.

```txt
program/DB/files/{dataset_name}.txt
```

업로드 후 프로그램은 파일을 읽고, 빈 줄을 제거한 뒤, 같은 경로에 덮어쓴다.

예를 들어 업로드된 원본 파일이 다음과 같다면:

```txt
가나다

라마바
사아자

차카타
```

전처리 후 저장되는 파일은 다음과 같다.

```txt
가나다
라마바
사아자
차카타
```

DB화는 전처리 후 저장된 파일을 기준으로 수행한다.

---

## 2.2 원본 줄 번호 보존 여부

원본 업로드 파일 기준 줄 번호는 보존하지 않는다.

즉, 빈 줄이 제거되기 전의 줄 번호는 필요 없다.

DB에는 **빈 줄 제거 후 저장된 txt 파일 기준 줄 번호**만 저장한다.

예:

원본 업로드 파일:

```txt
가나다

라마바
사아자
```

전처리 후 파일:

```txt
가나다
라마바
사아자
```

DB 저장 결과:

| line_number | text |
| ----------: | ---- |
|           1 | 가나다  |
|           2 | 라마바  |
|           3 | 사아자  |

---

## 2.3 검색어 전제

검색어는 영어가 아니다.

따라서 `and`, `or`는 검색어가 아니라 연산자로 취급한다.

지원하는 연산자는 다음과 같다.

| 입력    | 의미     |
| ----- | ------ |
| `and` | AND 검색 |
| `&`   | AND 검색 |
| `or`  | OR 검색  |
| `(`   | 그룹 시작  |
| `)`   | 그룹 종료  |

예시:

```txt
(가나다and라마)
(가나다&라마)
(가나다or사아)
((가나다and라마)or차카)
```

---

# 3. 최종 폴더 구조

## 3.1 권장 폴더 구조

```txt
.
├── docs
│   └── READMD.md
└── program
    ├── code
    │   ├── app.py
    │   ├── paths.py
    │   ├── importer.py
    │   ├── db.py
    │   ├── query_parser.py
    │   ├── search.py
    │   ├── templates
    │   │   ├── index.html
    │   │   ├── upload.html
    │   │   └── search.html
    │   └── static
    │       ├── style.css
    │       └── app.js
    └── DB
        ├── DB
        │   ├── sample_1
        │   │   └── data.sqlite
        │   └── sample_2
        │       └── data.sqlite
        └── files
            ├── sample_1.txt
            └── sample_2.txt
```

## 3.2 폴더별 역할

### `docs/`

개발 문서와 가이드 문서를 저장한다.

실행 코드나 데이터는 저장하지 않는다.

예:

```txt
docs/
└── READMD.md
```

---

### `program/code/`

Python 백엔드 코드, HTML 템플릿, CSS, JavaScript를 저장한다.

예:

```txt
program/code/
├── app.py
├── paths.py
├── importer.py
├── db.py
├── query_parser.py
├── search.py
├── templates/
└── static/
```

---

### `program/DB/files/`

사용자가 업로드한 txt 파일을 저장한다.

업로드 후 빈 줄 제거가 완료된 파일이 최종적으로 이곳에 저장된다.

예:

```txt
program/DB/files/sample_1.txt
program/DB/files/sample_2.txt
```

---

### `program/DB/DB/`

각 txt 파일에 대응되는 SQLite DB 폴더를 저장한다.

예:

```txt
program/DB/DB/sample_1/data.sqlite
program/DB/DB/sample_2/data.sqlite
```

---

# 4. 전체 사용자 흐름

## 4.1 첫 페이지

첫 페이지에는 버튼 2개가 있다.

```txt
[새 데이터 업로드] [기존 데이터 이용]
```

각 버튼의 역할은 다음과 같다.

| 버튼        | 역할                    |
| --------- | --------------------- |
| 새 데이터 업로드 | 새 txt 파일을 업로드하고 DB화한다 |
| 기존 데이터 이용 | 이미 DB화된 데이터 목록을 보여준다  |

---

## 4.2 새 데이터 업로드 흐름

사용자가 `새 데이터 업로드` 버튼을 누르면 파일 업로드 화면으로 이동한다.

처리 흐름:

```txt
1. 사용자가 txt 파일 업로드
2. 파일을 program/DB/files/에 저장
3. 화면에 "데이터 처리중..." 표시
4. 업로드된 파일 읽기
5. 빈 줄 제거
6. 같은 txt 파일에 덮어쓰기
7. 줄 단위로 분리
8. program/DB/DB/{dataset_name}/ 폴더 생성
9. data.sqlite 생성
10. 각 줄을 segments 테이블에 저장
11. 처리 완료
12. 화면에 "완료" 버튼 표시
13. 완료 버튼 클릭 시 첫 페이지로 이동
```

---

## 4.3 기존 데이터 이용 흐름

사용자가 `기존 데이터 이용` 버튼을 누르면 프로그램은 다음 폴더를 확인한다.

```txt
program/DB/DB/
```

이 폴더 안의 하위 폴더명을 데이터셋 목록으로 표시한다.

예:

```txt
sample_1
sample_2
```

사용자가 특정 데이터셋을 선택하면 검색 화면으로 이동한다.

---

## 4.4 검색 페이지 흐름

검색 페이지는 다음 구조를 가진다.

```txt
┌────┬──────────────────────────┬──────────────────────────┐
│    │ 검색창                   │ 원문 txt 표시             │
│세로│ 검색 결과 리스트          │                          │
│패널│                          │                          │
│    │                          │                          │
│홈  │                          │                          │
└────┴──────────────────────────┴──────────────────────────┘
```

화면 구성:

1. 왼쪽에 얇은 세로 패널
2. 세로 패널 왼쪽 아래에 `홈` 버튼
3. 메인 영역은 좌우 1:1 분할
4. 좌우 분할 비율은 마우스로 조절 가능
5. 왼쪽 영역 위쪽에는 검색창
6. 왼쪽 영역 아래쪽에는 검색 결과 블록 리스트
7. 오른쪽 영역에는 txt 파일 내용 표시
8. 검색 결과 블록 클릭 시 오른쪽 txt 영역의 해당 줄로 자동 이동

---

# 5. Backend 기술 스택

## 5.1 권장 기술

MVP 기준으로 다음 기술을 사용한다.

```txt
Backend: Python Flask
DB: SQLite
Frontend: HTML + CSS + JavaScript
Template: Jinja2
```

Flask를 권장하는 이유:

* 구조가 단순하다.
* 파일 업로드 구현이 쉽다.
* SQLite와 연결하기 쉽다.
* HTML 템플릿 렌더링이 간단하다.
* 작은 로컬 웹앱에 적합하다.

---

# 6. Backend 모듈 설계

## 6.1 `app.py`

Flask 앱의 진입점이다.

담당 역할:

* 서버 실행
* 페이지 라우팅
* API 라우팅
* 파일 업로드 요청 처리
* 검색 요청 처리
* 데이터셋 목록 조회
* txt 파일 내용 반환

주요 route:

```txt
GET  /
GET  /upload
POST /api/upload
GET  /datasets
GET  /search/<dataset_name>
GET  /api/datasets
GET  /api/file/<dataset_name>
GET  /api/search/<dataset_name>
```

---

## 6.2 `paths.py`

프로젝트 내 주요 경로를 관리한다.

담당 역할:

* `program/` 기준 경로 계산
* 파일 저장 경로 생성
* DB 저장 경로 생성
* 안전한 dataset name 생성
* 폴더 자동 생성

예상 상수:

```python
BASE_DIR
PROGRAM_DIR
CODE_DIR
DATA_ROOT_DIR
FILES_DIR
SQLITE_ROOT_DIR
```

예상 함수:

```python
ensure_dirs()
safe_dataset_name(filename: str) -> str
get_txt_path(dataset_name: str) -> Path
get_dataset_dir(dataset_name: str) -> Path
get_sqlite_path(dataset_name: str) -> Path
```

---

## 6.3 `importer.py`

txt 파일을 전처리하고 DB에 넣을 데이터를 생성한다.

담당 역할:

* txt 파일 읽기
* 빈 줄 제거
* 전처리된 txt 파일 덮어쓰기
* 줄 단위 segment 생성
* preview 생성

예상 함수:

```python
read_text_file(file_path: Path) -> str
clean_lines(raw_text: str) -> list[str]
overwrite_cleaned_file(file_path: Path, lines: list[str]) -> None
build_segments(lines: list[str]) -> list[dict]
import_txt_to_db(dataset_name: str, file_path: Path) -> None
```

---

## 6.4 `db.py`

SQLite DB 생성 및 데이터 저장을 담당한다.

담당 역할:

* SQLite 연결
* 테이블 생성
* 기존 데이터 삭제
* segment bulk insert
* segment 조회
* 검색 실행

예상 함수:

```python
connect_db(dataset_name: str) -> sqlite3.Connection
init_db(dataset_name: str) -> None
reset_segments(dataset_name: str) -> None
insert_segments(dataset_name: str, segments: list[dict]) -> None
list_datasets() -> list[str]
get_segments(dataset_name: str) -> list[dict]
```

---

## 6.5 `query_parser.py`

사용자가 입력한 검색식을 SQL WHERE 조건으로 변환한다.

담당 역할:

* 검색 쿼리 토큰화
* 괄호 검증
* 연산자 검증
* AST 생성
* SQL WHERE 조건 생성
* SQL 파라미터 생성

예상 함수:

```python
tokenize(query: str) -> list[Token]
parse(tokens: list[Token]) -> ASTNode
compile_to_sql(ast: ASTNode) -> tuple[str, list[str]]
parse_query_to_sql(query: str) -> tuple[str, list[str]]
```

---

## 6.6 `search.py`

검색 로직을 담당한다.

담당 역할:

* 검색 쿼리 검증
* query parser 호출
* DB 검색 실행
* 검색 결과 포맷팅
* preview 축약

예상 함수:

```python
search_segments(dataset_name: str, query: str) -> list[dict]
```

---

# 7. SQLite DB 설계

## 7.1 DB 파일 위치

각 데이터셋마다 별도의 SQLite DB 파일을 생성한다.

예:

```txt
program/DB/DB/sample_1/data.sqlite
program/DB/DB/sample_2/data.sqlite
```

---

## 7.2 기본 테이블: `segments`

줄 단위 데이터를 저장하는 테이블이다.

```sql
CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    preview TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

컬럼 설명:

| 컬럼            | 타입      | 설명                   |
| ------------- | ------- | -------------------- |
| `id`          | INTEGER | 내부 고유 ID             |
| `line_number` | INTEGER | 전처리 후 txt 파일 기준 줄 번호 |
| `text`        | TEXT    | 해당 줄의 전체 텍스트         |
| `preview`     | TEXT    | 화면 표시용 축약 텍스트        |
| `created_at`  | TEXT    | DB 저장 시각             |

---

## 7.3 메타 테이블: `dataset_meta`

데이터셋 정보를 저장하는 테이블이다.

config 폴더를 사용하지 않으므로, 데이터셋 관련 메타 정보는 SQLite 내부에 저장한다.

```sql
CREATE TABLE IF NOT EXISTS dataset_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

예상 저장 값:

| key            | value 예시                        |
| -------------- | ------------------------------- |
| `dataset_name` | `sample_1`                      |
| `file_name`    | `sample_1.txt`                  |
| `file_path`    | `program/DB/files/sample_1.txt` |
| `line_count`   | `1000`                          |
| `created_at`   | `2026-06-17T12:00:00`           |

---

## 7.4 인덱스

줄 번호 기반 이동을 빠르게 하기 위해 `line_number` 인덱스를 생성한다.

```sql
CREATE INDEX IF NOT EXISTS idx_segments_line_number
ON segments(line_number);
```

LIKE 검색은 `%검색어%` 구조이므로 일반 인덱스가 크게 도움 되지 않는다.

MVP에서는 단순 LIKE 검색으로 충분하다.

---

# 8. txt 전처리 설계

## 8.1 입력 파일 조건

업로드 가능한 파일은 `.txt` 파일로 제한한다.

권장 제한:

```txt
허용 확장자: .txt
기본 인코딩: utf-8-sig
보조 인코딩: cp949
```

한국어 txt 파일의 경우 `cp949`로 저장된 파일이 있을 수 있으므로, UTF-8-sig 읽기에 실패하면 `cp949`로 재시도하는 방식을 권장한다.

---

## 8.2 빈 줄 제거 규칙

빈 줄은 다음 기준으로 제거한다.

```python
line.strip() == ""
```

즉, 공백이나 탭만 있는 줄도 빈 줄로 간주한다.

예:

```txt
가나다
   
라마바
```

전처리 결과:

```txt
가나다
라마바
```

---

## 8.3 줄 저장 규칙

각 줄은 양쪽 공백을 제거한 뒤 저장한다.

```python
cleaned_line = line.strip()
```

따라서 다음 줄:

```txt
   가나다   
```

DB에는 다음처럼 저장된다.

```txt
가나다
```

---

## 8.4 전처리 결과 덮어쓰기

전처리된 줄은 다시 같은 txt 파일 경로에 저장한다.

저장 시 줄 구분자는 `\n`으로 통일한다.

```python
file_path.write_text("\n".join(cleaned_lines), encoding="utf-8")
```

---

## 8.5 segment 생성 규칙

전처리된 줄 리스트가 다음과 같을 때:

```python
["가나다", "라마바", "사아자"]
```

segment는 다음처럼 생성한다.

```python
[
    {
        "line_number": 1,
        "text": "가나다",
        "preview": "가나다"
    },
    {
        "line_number": 2,
        "text": "라마바",
        "preview": "라마바"
    },
    {
        "line_number": 3,
        "text": "사아자",
        "preview": "사아자"
    }
]
```

---

# 9. 검색 기능 설계

## 9.1 검색 목표

사용자는 검색창에 논리 검색식을 입력한다.

예:

```txt
(가나다and라마)
```

프로그램은 이 검색식을 파싱하여 SQLite 검색 조건으로 변환한다.

변환 결과:

```sql
WHERE (text LIKE ? AND text LIKE ?)
```

파라미터:

```python
["%가나다%", "%라마%"]
```

---

## 9.2 지원 검색 문법

지원 문법:

```txt
검색어
검색어and검색어
검색어&검색어
검색어or검색어
(검색어and검색어)
((검색어and검색어)or검색어)
```

지원 토큰:

| 토큰     | 의미    |
| ------ | ----- |
| `TERM` | 검색어   |
| `and`  | AND   |
| `&`    | AND   |
| `or`   | OR    |
| `(`    | 그룹 시작 |
| `)`    | 그룹 종료 |

---

## 9.3 검색어 조건

검색어는 영어가 아니다.

따라서 `and`, `or`는 항상 연산자로 취급한다.

예:

```txt
가나다and라마
```

해석:

```txt
TERM("가나다") AND TERM("라마")
```

---

## 9.4 연산자 우선순위

연산자 우선순위는 다음과 같다.

```txt
1순위: 괄호 ()
2순위: and, &
3순위: or
```

예:

```txt
가나다or라마and사아
```

해석:

```txt
가나다 OR (라마 AND 사아)
```

명확한 검색을 위해 복잡한 검색식에서는 괄호 사용을 권장한다.

---

## 9.5 검색 문법 Grammar

```txt
expression := or_expr

or_expr := and_expr ("or" and_expr)*

and_expr := primary (("and" | "&") primary)*

primary := TERM | "(" expression ")"
```

---

## 9.6 Tokenizer 설계

입력 문자열:

```txt
((가나다and라마)or사아)
```

토큰화 결과:

```python
[
    Token("LPAREN", "("),
    Token("LPAREN", "("),
    Token("TERM", "가나다"),
    Token("AND", "and"),
    Token("TERM", "라마"),
    Token("RPAREN", ")"),
    Token("OR", "or"),
    Token("TERM", "사아"),
    Token("RPAREN", ")")
]
```

Tokenizer 규칙:

1. `(`는 `LPAREN`
2. `)`는 `RPAREN`
3. `&`는 `AND`
4. `and`는 `AND`
5. `or`는 `OR`
6. 그 외 연속 문자열은 `TERM`

검색어가 영어가 아니므로 `and`, `or`와 검색어의 충돌은 고려하지 않는다.

---

## 9.7 AST 구조

검색식은 내부적으로 AST로 변환한다.

예:

```txt
(가나다and라마)or사아
```

AST:

```txt
OR
├── AND
│   ├── TERM("가나다")
│   └── TERM("라마")
└── TERM("사아")
```

Python 표현 예시:

```python
@dataclass
class TermNode:
    value: str

@dataclass
class BinaryNode:
    op: str
    left: object
    right: object
```

---

## 9.8 SQL 변환 규칙

### TERM

```txt
TERM("가나다")
```

SQL:

```sql
text LIKE ? ESCAPE '\'
```

Params:

```python
["%가나다%"]
```

---

### AND

```txt
가나다and라마
```

SQL:

```sql
(text LIKE ? ESCAPE '\' AND text LIKE ? ESCAPE '\')
```

Params:

```python
["%가나다%", "%라마%"]
```

---

### OR

```txt
가나다or라마
```

SQL:

```sql
(text LIKE ? ESCAPE '\' OR text LIKE ? ESCAPE '\')
```

Params:

```python
["%가나다%", "%라마%"]
```

---

## 9.9 LIKE 특수문자 처리

SQLite LIKE에서 `%`, `_`는 와일드카드로 동작한다.

검색어에 `%`, `_`, `\`가 포함될 수 있으므로 escape 처리를 해야 한다.

```python
def escape_like(term: str) -> str:
    term = term.replace("\\", "\\\\")
    term = term.replace("%", "\\%")
    term = term.replace("_", "\\_")
    return term
```

최종 파라미터:

```python
f"%{escape_like(term)}%"
```

SQL:

```sql
text LIKE ? ESCAPE '\'
```

---

# 10. 검색 API 설계

## 10.1 검색 요청

Endpoint:

```txt
GET /api/search/<dataset_name>?q={query}
```

예:

```txt
GET /api/search/sample_1?q=(가나다and라마)
```

---

## 10.2 검색 응답

응답 형식:

```json
{
  "ok": true,
  "query": "(가나다and라마)",
  "count": 2,
  "results": [
    {
      "id": 1,
      "line_number": 10,
      "text": "가나다 라마바 사아자",
      "preview": "가나다 라마바 사아자"
    },
    {
      "id": 2,
      "line_number": 25,
      "text": "가나다 라마 포함 문장",
      "preview": "가나다 라마 포함 문장"
    }
  ]
}
```

---

## 10.3 검색 실패 응답

문법 오류가 있을 경우:

```json
{
  "ok": false,
  "error": "Invalid search query",
  "detail": "닫는 괄호가 없습니다."
}
```

예상 오류:

| 오류       | 설명                     |
| -------- | ---------------------- |
| 빈 검색어    | 검색어가 입력되지 않음           |
| 괄호 불일치   | `(`와 `)` 개수가 맞지 않음     |
| 연산자 연속   | `가나다andor라마` 같은 잘못된 구조 |
| 끝나는 연산자  | `가나다and`               |
| 시작하는 연산자 | `and가나다`               |
| 빈 괄호     | `()`                   |

---

# 11. Frontend 화면 설계

## 11.1 첫 페이지

첫 페이지 역할:

* 새 데이터 업로드 화면으로 이동
* 기존 데이터 목록 화면으로 이동

UI:

```txt
TXT Line Search DB

[새 데이터 업로드]
[기존 데이터 이용]
```

---

## 11.2 업로드 페이지

업로드 페이지 역할:

* txt 파일 선택
* 업로드 실행
* 처리 상태 표시
* 완료 후 홈으로 이동

UI 상태:

### 초기 상태

```txt
파일을 업로드하세요.

[파일 선택]
[업로드]
```

### 처리 중 상태

```txt
데이터 처리중...
```

### 완료 상태

```txt
완료되었습니다.

[완료]
```

---

## 11.3 기존 데이터 목록 페이지

기존 데이터 이용 버튼을 누르면 DB 폴더를 확인하여 데이터셋 목록을 보여준다.

예:

```txt
기존 데이터 선택

- sample_1
- sample_2
```

데이터셋을 클릭하면 검색 페이지로 이동한다.

---

## 11.4 검색 페이지

검색 페이지는 다음 영역으로 구성한다.

```txt
┌───────┬────────────────────────┬────────────────────────┐
│       │ 검색창                 │ 원문 txt                │
│ 사이드│ 검색 결과               │                         │
│ 패널  │                         │                         │
│       │                         │                         │
│ 홈    │                         │                         │
└───────┴────────────────────────┴────────────────────────┘
```

---

## 11.5 사이드 패널

사이드 패널은 얇은 세로줄 형태로 배치한다.

하단에는 `홈` 버튼을 둔다.

`홈` 버튼 클릭 시 첫 페이지로 이동한다.

---

## 11.6 좌우 분할 영역

검색 페이지의 메인 영역은 좌우 1:1로 나눈다.

좌우 사이에는 resizer bar를 둔다.

사용자는 마우스로 resizer를 드래그하여 좌우 비율을 조절할 수 있다.

기본 비율:

```txt
왼쪽 50%
오른쪽 50%
```

최소 폭:

```txt
왼쪽 최소 300px
오른쪽 최소 300px
```

---

## 11.7 검색창

검색창은 왼쪽 영역 상단에 위치한다.

구성:

```txt
[검색어 입력창] [검색 버튼]
```

검색창에 값이 없으면 검색 버튼은 비활성화한다.

검색창에 값이 있으면 검색 버튼을 활성화한다.

검색 버튼 클릭 시 `/api/search/<dataset_name>` API를 호출한다.

Enter 키를 눌러도 검색이 실행되도록 한다.

---

## 11.8 검색 결과 리스트

검색 결과는 왼쪽 영역 하단에 블록 단위로 표시한다.

각 블록에는 다음 정보를 표시한다.

```txt
Line 12
가나다 라마바 사아자...
```

결과 텍스트가 길면 `...`으로 축약한다.

CSS 예:

```css
.result-preview {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
```

또는 여러 줄 축약을 사용할 수 있다.

```css
.result-preview {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
```

---

## 11.9 오른쪽 원문 txt 표시

오른쪽 창에는 전처리 후 저장된 txt 파일을 표시한다.

각 줄은 별도 요소로 렌더링한다.

예:

```html
<div class="line" id="line-1">가나다</div>
<div class="line" id="line-2">라마바</div>
<div class="line" id="line-3">사아자</div>
```

검색 결과 클릭 시 해당 줄로 이동해야 하므로 각 줄에 `id="line-{line_number}"`를 붙인다.

---

## 11.10 검색 결과 클릭 시 원문 이동

검색 결과 블록에는 `line_number`를 저장한다.

예:

```html
<div class="result-block" data-line-number="25">
    ...
</div>
```

클릭 시:

```javascript
const lineNumber = resultBlock.dataset.lineNumber;
const target = document.getElementById(`line-${lineNumber}`);

target.scrollIntoView({
    behavior: "smooth",
    block: "center"
});
```

해당 줄에는 highlight 클래스를 잠시 적용한다.

```javascript
target.classList.add("highlight");

setTimeout(() => {
    target.classList.remove("highlight");
}, 1500);
```

---

# 12. 주요 API 상세 설계

## 12.1 `GET /`

첫 페이지를 반환한다.

Response:

```txt
index.html
```

---

## 12.2 `GET /upload`

업로드 페이지를 반환한다.

Response:

```txt
upload.html
```

---

## 12.3 `POST /api/upload`

txt 파일을 업로드하고 DB화한다.

Request:

```txt
multipart/form-data
file: sample_1.txt
```

처리 순서:

```txt
1. 파일 존재 여부 확인
2. 확장자 .txt 확인
3. 안전한 dataset_name 생성
4. program/DB/files/{dataset_name}.txt 저장
5. txt 파일 읽기
6. 빈 줄 제거
7. txt 파일 덮어쓰기
8. program/DB/DB/{dataset_name}/data.sqlite 생성
9. segments 테이블 생성
10. 줄 단위 insert
11. 성공 응답 반환
```

Success Response:

```json
{
  "ok": true,
  "dataset_name": "sample_1",
  "line_count": 1000
}
```

Error Response:

```json
{
  "ok": false,
  "error": "Only .txt files are allowed"
}
```

---

## 12.4 `GET /api/datasets`

기존 DB 목록을 반환한다.

조회 대상:

```txt
program/DB/DB/
```

Response:

```json
{
  "ok": true,
  "datasets": [
    "sample_1",
    "sample_2"
  ]
}
```

---

## 12.5 `GET /search/<dataset_name>`

검색 페이지를 반환한다.

Response:

```txt
search.html
```

---

## 12.6 `GET /api/file/<dataset_name>`

오른쪽 창에 표시할 txt 파일 내용을 반환한다.

Response:

```json
{
  "ok": true,
  "dataset_name": "sample_1",
  "lines": [
    {
      "line_number": 1,
      "text": "가나다"
    },
    {
      "line_number": 2,
      "text": "라마바"
    }
  ]
}
```

---

## 12.7 `GET /api/search/<dataset_name>?q=...`

검색 결과를 반환한다.

Response:

```json
{
  "ok": true,
  "query": "(가나다and라마)",
  "count": 1,
  "results": [
    {
      "id": 10,
      "line_number": 10,
      "text": "가나다 라마 포함 줄",
      "preview": "가나다 라마 포함 줄"
    }
  ]
}
```

---

# 13. 주요 코드 구현 방향

## 13.1 `paths.py`

```python
from pathlib import Path
import re

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
```

---

## 13.2 `importer.py`

```python
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
```

---

## 13.3 `db.py`

```python
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
```

---

# 14. Query Parser 구현 명세

## 14.1 Token 클래스

```python
from dataclasses import dataclass

@dataclass
class Token:
    type: str
    value: str
```

Token type:

```txt
TERM
AND
OR
LPAREN
RPAREN
EOF
```

---

## 14.2 AST 클래스

```python
from dataclasses import dataclass

@dataclass
class TermNode:
    value: str

@dataclass
class BinaryNode:
    op: str
    left: object
    right: object
```

---

## 14.3 Tokenizer 구현 방향

검색어는 영어가 아니므로, `and`, `or`는 연산자로 처리한다.

```python
def tokenize(query: str) -> list[Token]:
    tokens = []
    i = 0

    while i < len(query):
        ch = query[i]

        if ch.isspace():
            i += 1
            continue

        if ch == "(":
            tokens.append(Token("LPAREN", ch))
            i += 1
            continue

        if ch == ")":
            tokens.append(Token("RPAREN", ch))
            i += 1
            continue

        if ch == "&":
            tokens.append(Token("AND", ch))
            i += 1
            continue

        if query.startswith("and", i):
            tokens.append(Token("AND", "and"))
            i += 3
            continue

        if query.startswith("or", i):
            tokens.append(Token("OR", "or"))
            i += 2
            continue

        start = i
        while i < len(query):
            if query[i] in "()&":
                break
            if query.startswith("and", i):
                break
            if query.startswith("or", i):
                break
            i += 1

        term = query[start:i].strip()
        if term:
            tokens.append(Token("TERM", term))

    tokens.append(Token("EOF", ""))
    return tokens
```

---

## 14.4 Parser 구현 방향

Recursive descent parser를 사용한다.

```python
class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.pos = 0

    def current(self) -> Token:
        return self.tokens[self.pos]

    def eat(self, token_type: str) -> Token:
        token = self.current()
        if token.type != token_type:
            raise ValueError(f"Expected {token_type}, got {token.type}")
        self.pos += 1
        return token

    def parse(self):
        node = self.parse_or()
        if self.current().type != "EOF":
            raise ValueError("Unexpected token after expression")
        return node

    def parse_or(self):
        node = self.parse_and()

        while self.current().type == "OR":
            self.eat("OR")
            right = self.parse_and()
            node = BinaryNode("OR", node, right)

        return node

    def parse_and(self):
        node = self.parse_primary()

        while self.current().type == "AND":
            self.eat("AND")
            right = self.parse_primary()
            node = BinaryNode("AND", node, right)

        return node

    def parse_primary(self):
        token = self.current()

        if token.type == "TERM":
            self.eat("TERM")
            return TermNode(token.value)

        if token.type == "LPAREN":
            self.eat("LPAREN")
            node = self.parse_or()
            self.eat("RPAREN")
            return node

        raise ValueError(f"Unexpected token: {token.type}")
```

---

## 14.5 SQL Compiler 구현 방향

```python
def escape_like(term: str) -> str:
    term = term.replace("\\", "\\\\")
    term = term.replace("%", "\\%")
    term = term.replace("_", "\\_")
    return term

def compile_to_sql(node) -> tuple[str, list[str]]:
    if isinstance(node, TermNode):
        return "text LIKE ? ESCAPE '\\'", [f"%{escape_like(node.value)}%"]

    if isinstance(node, BinaryNode):
        left_sql, left_params = compile_to_sql(node.left)
        right_sql, right_params = compile_to_sql(node.right)

        if node.op == "AND":
            return f"({left_sql} AND {right_sql})", left_params + right_params

        if node.op == "OR":
            return f"({left_sql} OR {right_sql})", left_params + right_params

    raise ValueError("Unknown AST node")
```

---

## 14.6 최종 변환 함수

```python
def parse_query_to_sql(query: str) -> tuple[str, list[str]]:
    if not query or not query.strip():
        raise ValueError("검색어가 비어 있습니다.")

    tokens = tokenize(query)
    parser = Parser(tokens)
    ast = parser.parse()

    return compile_to_sql(ast)
```

---

# 15. 검색 실행 구현

## 15.1 `search.py`

```python
from db import connect_db
from query_parser import parse_query_to_sql

def search_segments(dataset_name: str, query: str) -> list[dict]:
    where_sql, params = parse_query_to_sql(query)

    sql = f"""
    SELECT id, line_number, text, preview
    FROM segments
    WHERE {where_sql}
    ORDER BY line_number ASC
    """

    conn = connect_db(dataset_name)
    cur = conn.cursor()
    rows = cur.execute(sql, params).fetchall()
    conn.close()

    return [
        {
            "id": row["id"],
            "line_number": row["line_number"],
            "text": row["text"],
            "preview": row["preview"]
        }
        for row in rows
    ]
```

---

# 16. Flask App 구현 방향

## 16.1 주요 흐름

```python
from flask import Flask, render_template, request, jsonify
from pathlib import Path

from paths import ensure_dirs, safe_dataset_name, get_txt_path
from importer import read_text_file, clean_lines, overwrite_cleaned_file, build_segments
from db import init_db, reset_segments, insert_segments, list_datasets, set_meta
from search import search_segments

app = Flask(__name__)

ensure_dirs()
```

---

## 16.2 업로드 API 흐름

```python
@app.post("/api/upload")
def upload_file():
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "No file uploaded"}), 400

    file = request.files["file"]

    if not file.filename:
        return jsonify({"ok": False, "error": "Empty filename"}), 400

    if not file.filename.lower().endswith(".txt"):
        return jsonify({"ok": False, "error": "Only .txt files are allowed"}), 400

    dataset_name = safe_dataset_name(file.filename)
    txt_path = get_txt_path(dataset_name)

    file.save(txt_path)

    raw_text = read_text_file(txt_path)
    lines = clean_lines(raw_text)
    overwrite_cleaned_file(txt_path, lines)

    segments = build_segments(lines)

    init_db(dataset_name)
    reset_segments(dataset_name)
    insert_segments(dataset_name, segments)

    set_meta(dataset_name, "dataset_name", dataset_name)
    set_meta(dataset_name, "file_name", f"{dataset_name}.txt")
    set_meta(dataset_name, "file_path", str(txt_path))
    set_meta(dataset_name, "line_count", str(len(lines)))

    return jsonify({
        "ok": True,
        "dataset_name": dataset_name,
        "line_count": len(lines)
    })
```

---

# 17. Frontend JavaScript 구현 방향

## 17.1 검색 버튼 활성화

```javascript
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");

searchInput.addEventListener("input", () => {
    searchButton.disabled = searchInput.value.trim().length === 0;
});
```

---

## 17.2 검색 실행

```javascript
async function runSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    const response = await fetch(`/api/search/${datasetName}?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!data.ok) {
        alert(data.detail || data.error || "검색 중 오류가 발생했습니다.");
        return;
    }

    renderResults(data.results);
}
```

---

## 17.3 검색 결과 렌더링

```javascript
function renderResults(results) {
    const container = document.getElementById("results");
    container.innerHTML = "";

    if (results.length === 0) {
        container.innerHTML = `<div class="empty-result">검색 결과가 없습니다.</div>`;
        return;
    }

    for (const item of results) {
        const block = document.createElement("div");
        block.className = "result-block";
        block.dataset.lineNumber = item.line_number;

        block.innerHTML = `
            <div class="result-line">Line ${item.line_number}</div>
            <div class="result-preview">${escapeHtml(item.preview)}</div>
        `;

        block.addEventListener("click", () => {
            scrollToLine(item.line_number);
        });

        container.appendChild(block);
    }
}
```

---

## 17.4 원문 줄 이동

```javascript
function scrollToLine(lineNumber) {
    const target = document.getElementById(`line-${lineNumber}`);
    if (!target) return;

    target.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    target.classList.add("highlight");

    setTimeout(() => {
        target.classList.remove("highlight");
    }, 1500);
}
```

---

## 17.5 HTML escape

```javascript
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
```

---

# 18. CSS 설계

## 18.1 전체 레이아웃

```css
body {
    margin: 0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f6f6f6;
    color: #111;
}

.app-shell {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
}
```

---

## 18.2 사이드 패널

```css
.side-panel {
    width: 56px;
    background: #111;
    color: #fff;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    padding: 12px 0;
}

.home-button {
    writing-mode: vertical-rl;
    text-decoration: none;
    color: #fff;
    font-size: 14px;
}
```

---

## 18.3 분할 영역

```css
.main-split {
    flex: 1;
    display: flex;
    min-width: 0;
}

.left-pane,
.right-pane {
    height: 100%;
    overflow: hidden;
}

.left-pane {
    width: 50%;
    min-width: 300px;
    background: #fff;
    border-right: 1px solid #ddd;
    display: flex;
    flex-direction: column;
}

.right-pane {
    flex: 1;
    min-width: 300px;
    background: #fafafa;
    overflow-y: auto;
}
```

---

## 18.4 검색 영역

```css
.search-bar {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid #ddd;
}

.search-bar input {
    flex: 1;
    padding: 10px 12px;
    font-size: 15px;
}

.search-bar button {
    padding: 10px 16px;
    font-size: 15px;
    cursor: pointer;
}

.search-bar button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
```

---

## 18.5 검색 결과

```css
.results {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
}

.result-block {
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #fff;
    margin-bottom: 10px;
    cursor: pointer;
}

.result-block:hover {
    background: #f2f2f2;
}

.result-line {
    font-size: 12px;
    color: #666;
    margin-bottom: 6px;
}

.result-preview {
    font-size: 14px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
```

---

## 18.6 원문 표시

```css
.file-viewer {
    padding: 16px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 14px;
    line-height: 1.7;
}

.line {
    white-space: pre-wrap;
    padding: 2px 6px;
    border-radius: 4px;
}

.line.highlight {
    background: #fff3a3;
}
```

---

# 19. 좌우 비율 조절 Resizer

## 19.1 HTML 구조

```html
<div class="main-split">
    <div class="left-pane" id="left-pane">
        ...
    </div>

    <div class="resizer" id="resizer"></div>

    <div class="right-pane" id="right-pane">
        ...
    </div>
</div>
```

---

## 19.2 CSS

```css
.resizer {
    width: 6px;
    cursor: col-resize;
    background: #ddd;
}

.resizer:hover {
    background: #bbb;
}
```

---

## 19.3 JavaScript

```javascript
const resizer = document.getElementById("resizer");
const leftPane = document.getElementById("left-pane");
const mainSplit = document.querySelector(".main-split");

let isDragging = false;

resizer.addEventListener("mousedown", () => {
    isDragging = true;
    document.body.style.cursor = "col-resize";
});

document.addEventListener("mousemove", (event) => {
    if (!isDragging) return;

    const containerRect = mainSplit.getBoundingClientRect();
    const newLeftWidth = event.clientX - containerRect.left;

    if (newLeftWidth < 300) return;
    if (containerRect.width - newLeftWidth < 300) return;

    leftPane.style.width = `${newLeftWidth}px`;
});

document.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.cursor = "";
});
```

---

# 20. 보안 및 안정성 요구사항

## 20.1 파일명 안전 처리

사용자가 업로드한 파일명을 그대로 경로에 사용하면 안 된다.

위험 예:

```txt
../../somewhere/file.txt
```

따라서 반드시 안전한 dataset name으로 변환한다.

허용 문자:

```txt
영문
숫자
한글
_
-
```

그 외 문자는 `_`로 변환한다.

---

## 20.2 경로 이탈 방지

모든 파일 저장 경로는 반드시 다음 폴더 내부여야 한다.

```txt
program/DB/files/
program/DB/DB/
```

사용자 입력으로 직접 파일 경로를 만들지 않는다.

---

## 20.3 SQL Injection 방지

검색어를 SQL 문자열에 직접 붙이면 안 된다.

금지:

```python
sql = f"SELECT * FROM segments WHERE text LIKE '%{term}%'"
```

허용:

```python
sql = "SELECT * FROM segments WHERE text LIKE ?"
params = [f"%{term}%"]
```

검색식 파서가 SQL 구조를 만들더라도, 실제 검색어 값은 반드시 parameter binding으로 전달한다.

---

## 20.4 HTML Injection 방지

txt 파일 내용은 사용자가 업로드한 데이터이므로, 브라우저에 표시할 때 HTML escape가 필요하다.

예를 들어 txt 안에 다음 내용이 있을 수 있다.

```html
<script>alert(1)</script>
```

이를 그대로 `innerHTML`로 넣으면 안 된다.

해결 방법:

* 서버 템플릿에서는 Jinja escape 사용
* JavaScript에서는 `textContent` 사용
* `innerHTML` 사용 시 직접 escape 처리

---

## 20.5 파일 크기 제한

MVP에서는 파일 크기 제한을 두는 것이 좋다.

예:

```txt
최대 업로드 크기: 20MB
```

Flask 설정 예:

```python
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024
```

---

# 21. 예외 처리 정책

## 21.1 업로드 예외

| 상황             | 처리                               |
| -------------- | -------------------------------- |
| 파일 없음          | `No file uploaded` 반환            |
| 파일명 없음         | `Empty filename` 반환              |
| txt 아님         | `Only .txt files are allowed` 반환 |
| 인코딩 실패         | `Unable to decode file` 반환       |
| 빈 줄 제거 후 내용 없음 | `No valid lines found` 반환        |

---

## 21.2 검색 예외

| 상황       | 처리                 |
| -------- | ------------------ |
| 검색어 없음   | 검색 버튼 비활성화         |
| 잘못된 괄호   | 오류 메시지 표시          |
| 연산자 연속   | 오류 메시지 표시          |
| 검색 결과 없음 | `검색 결과가 없습니다.` 표시  |
| DB 없음    | 첫 페이지로 이동 또는 오류 표시 |

---

# 22. 성능 고려사항

## 22.1 MVP 기준

MVP에서는 다음 방식으로 충분하다.

```txt
검색 방식: SQLite LIKE
표시 방식: 오른쪽에 전체 txt 렌더링
DB 단위: 파일 1개당 SQLite 1개
```

수천 줄에서 수만 줄 규모는 문제 없이 동작할 가능성이 높다.

---

## 22.2 대용량 파일 고려

txt 파일이 매우 커질 경우 다음 문제가 발생할 수 있다.

| 문제          | 원인                                 |
| ----------- | ---------------------------------- |
| 검색 속도 저하    | `%검색어%` LIKE 검색은 일반 인덱스를 잘 사용하지 못함 |
| 브라우저 렌더링 느림 | 오른쪽 창에 전체 줄을 한 번에 렌더링              |
| 메모리 사용 증가   | 파일 전체를 한 번에 읽음                     |

대용량 대응은 MVP 이후 고려한다.

확장 방향:

```txt
1. 페이지네이션
2. 오른쪽 원문 virtual scroll
3. 검색 결과 주변 N줄만 로드
4. SQLite FTS 또는 n-gram 인덱스 추가
5. 파일 streaming 처리
```

---

# 23. MVP 개발 순서

## Phase 1. 프로젝트 골격 생성

목표:

```txt
program/code/
program/DB/files/
program/DB/DB/
```

작업:

1. 폴더 생성
2. Flask 앱 생성
3. 첫 페이지 렌더링
4. 정적 파일 연결 확인

완료 기준:

```txt
브라우저에서 첫 페이지가 열린다.
```

---

## Phase 2. 파일 업로드 구현

작업:

1. 업로드 페이지 생성
2. `.txt` 파일 업로드 구현
3. `program/DB/files/`에 저장
4. 파일명 안전 처리 구현

완료 기준:

```txt
sample_1.txt를 업로드하면 program/DB/files/sample_1.txt가 생성된다.
```

---

## Phase 3. txt 전처리 구현

작업:

1. 파일 읽기
2. 빈 줄 제거
3. 양쪽 공백 제거
4. UTF-8로 덮어쓰기
5. 줄 리스트 반환

완료 기준:

```txt
빈 줄이 제거된 txt 파일이 files 폴더에 저장된다.
```

---

## Phase 4. SQLite DB화 구현

작업:

1. `program/DB/DB/{dataset_name}/` 폴더 생성
2. `data.sqlite` 생성
3. `segments` 테이블 생성
4. 줄 단위 insert
5. line_number 저장

완료 기준:

```txt
txt 파일의 각 줄이 DB에 line_number와 함께 저장된다.
```

---

## Phase 5. 기존 데이터 목록 구현

작업:

1. `program/DB/DB/` 폴더 조회
2. `data.sqlite`가 있는 데이터셋만 목록화
3. 화면에 리스트 표시
4. 클릭 시 검색 페이지 이동

완료 기준:

```txt
sample_1, sample_2 같은 기존 DB 목록이 표시된다.
```

---

## Phase 6. 검색 쿼리 파서 구현

작업:

1. Tokenizer 구현
2. Parser 구현
3. AST 구현
4. SQL compiler 구현
5. 에러 처리 구현

완료 기준:

```txt
(가나다and라마)
(가나다&라마)
((가나다and라마)or사아)
```

위 검색식이 SQL WHERE 조건으로 변환된다.

---

## Phase 7. 검색 API 구현

작업:

1. `/api/search/<dataset_name>` 구현
2. query parser 연결
3. SQLite 검색 실행
4. JSON 응답 반환

완료 기준:

```txt
검색어를 입력하면 조건에 맞는 줄이 JSON으로 반환된다.
```

---

## Phase 8. 검색 페이지 UI 구현

작업:

1. 검색창 구현
2. 검색 버튼 활성화/비활성화
3. 검색 결과 블록 표시
4. 결과 preview 축약
5. 결과 없음 표시

완료 기준:

```txt
검색창에 쿼리를 입력하면 왼쪽 하단에 검색 결과가 표시된다.
```

---

## Phase 9. 오른쪽 원문 표시 및 이동 구현

작업:

1. txt 파일 전체 줄 로드
2. 오른쪽 창에 줄 단위 렌더링
3. 각 줄에 `line-{line_number}` ID 부여
4. 검색 결과 클릭 시 해당 줄로 scroll
5. 해당 줄 highlight

완료 기준:

```txt
검색 결과를 클릭하면 오른쪽 txt 창이 해당 줄로 이동한다.
```

---

## Phase 10. 좌우 resizer 구현

작업:

1. resizer bar 추가
2. mousedown/mousemove/mouseup 이벤트 구현
3. 최소 폭 제한
4. 좌우 비율 조절

완료 기준:

```txt
마우스로 왼쪽/오른쪽 창 비율을 조절할 수 있다.
```

---

# 24. 테스트 시나리오

## 24.1 업로드 테스트

입력 파일:

```txt
가나다

라마바
사아자

차카타
```

예상 저장 파일:

```txt
가나다
라마바
사아자
차카타
```

예상 DB:

| line_number | text |
| ----------: | ---- |
|           1 | 가나다  |
|           2 | 라마바  |
|           3 | 사아자  |
|           4 | 차카타  |

---

## 24.2 AND 검색 테스트

DB:

```txt
1: 가나다 라마
2: 가나다 사아
3: 라마 사아
4: 가나다 라마 사아
```

검색:

```txt
가나다and라마
```

예상 결과:

```txt
1: 가나다 라마
4: 가나다 라마 사아
```

---

## 24.3 `&` 검색 테스트

검색:

```txt
가나다&라마
```

예상 결과:

```txt
1: 가나다 라마
4: 가나다 라마 사아
```

---

## 24.4 OR 검색 테스트

검색:

```txt
가나다or차카
```

예상 결과:

```txt
1: 가나다 라마
2: 가나다 사아
4: 가나다 라마 사아
```

차카가 포함된 줄이 있다면 해당 줄도 포함된다.

---

## 24.5 괄호 검색 테스트

검색:

```txt
(가나다and라마)or사아
```

해석:

```txt
(가나다 AND 라마) OR 사아
```

예상 결과:

```txt
1: 가나다 라마
2: 가나다 사아
3: 라마 사아
4: 가나다 라마 사아
```

---

## 24.6 우선순위 테스트

검색:

```txt
가나다or라마and사아
```

해석:

```txt
가나다 OR (라마 AND 사아)
```

---

## 24.7 잘못된 검색식 테스트

| 입력          | 예상 결과 |
| ----------- | ----- |
| `가나다and`    | 오류    |
| `and가나다`    | 오류    |
| `(가나다and라마` | 오류    |
| `가나다oror라마` | 오류    |
| `()`        | 오류    |

---

# 25. 구현 완료 기준

이 프로젝트의 MVP 완료 기준은 다음과 같다.

```txt
1. 첫 페이지가 표시된다.
2. 새 txt 파일을 업로드할 수 있다.
3. 업로드된 txt 파일이 program/DB/files/에 저장된다.
4. 빈 줄이 제거된 상태로 파일이 덮어쓰기된다.
5. 줄 단위로 SQLite DB가 생성된다.
6. 각 줄에는 line_number가 저장된다.
7. 기존 DB 목록을 확인할 수 있다.
8. 기존 DB를 선택하면 검색 페이지로 이동한다.
9. 검색식으로 줄 단위 검색을 할 수 있다.
10. and / or / & / () 검색이 동작한다.
11. 검색 결과가 왼쪽에 블록 형태로 표시된다.
12. 긴 검색 결과는 축약 표시된다.
13. 오른쪽에는 txt 파일 전체 내용이 표시된다.
14. 검색 결과 클릭 시 해당 줄로 이동한다.
15. 홈 버튼을 누르면 첫 페이지로 이동한다.
16. 좌우 패널 비율을 마우스로 조절할 수 있다.
```

---

# 26. 추후 확장 가능 기능

MVP 이후 다음 기능을 추가할 수 있다.

## 26.1 데이터셋 삭제

기존 데이터 목록에서 데이터셋 삭제 버튼을 추가한다.

삭제 대상:

```txt
program/DB/files/{dataset_name}.txt
program/DB/DB/{dataset_name}/
```

---

## 26.2 데이터셋 이름 변경

업로드 시 자동 생성된 dataset name을 사용자가 수정할 수 있게 한다.

---

## 26.3 검색 결과 내 하이라이트

검색 결과 preview 안에서 검색어와 일치하는 부분을 강조 표시한다.

예:

```txt
가나다 <mark>라마</mark> 사아자
```

---

## 26.4 검색 히스토리

최근 검색어를 브라우저 localStorage에 저장한다.

---

## 26.5 대용량 txt 최적화

오른쪽 txt 전체 렌더링 대신 virtual scroll을 적용한다.

---

## 26.6 검색 인덱스 개선

LIKE 검색이 느려질 경우 n-gram 기반 별도 인덱스 테이블을 추가한다.

---

# 27. 최종 요약

이 프로그램은 txt 파일을 줄 단위로 SQLite DB에 저장하고, 사용자가 입력한 논리 검색식으로 특정 줄을 검색하는 로컬 웹 기반 검색 도구이다.

핵심 설계는 다음과 같다.

```txt
txt 파일 업로드
→ 빈 줄 제거
→ 전처리된 txt 파일 저장
→ 줄 단위 DB화
→ line_number 저장
→ 검색식 파싱
→ SQL LIKE 검색
→ 결과 블록 표시
→ 결과 클릭 시 원문 줄 이동
```

현재 확정된 중요한 제약은 다음과 같다.

```txt
1. 원본 업로드 파일 기준 줄 번호는 보존하지 않는다.
2. 빈 줄 제거 후 저장된 txt 파일 기준 line_number만 저장한다.
3. 검색어는 영어가 아니다.
4. and, or, &는 연산자로 처리한다.
5. 검색 단위는 문단이나 문장이 아니라 줄이다.
6. 모든 코드와 데이터는 program/ 안에 둔다.
```

이 구조를 기준으로 개발하면 MVP를 단순하고 안정적으로 구현할 수 있다.
