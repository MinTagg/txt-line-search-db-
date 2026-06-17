from dataclasses import dataclass

@dataclass
class Token:
    type: str  # TERM, AND, OR, LPAREN, RPAREN, EOF
    value: str

@dataclass
class TermNode:
    value: str

@dataclass
class BinaryNode:
    op: str  # AND, OR
    left: object
    right: object

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

def parse_query_to_sql(query: str) -> tuple[str, list[str]]:
    if not query or not query.strip():
        raise ValueError("검색어가 비어 있습니다.")

    tokens = tokenize(query)
    parser = Parser(tokens)
    ast = parser.parse()

    return compile_to_sql(ast)
