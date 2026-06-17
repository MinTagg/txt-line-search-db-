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
