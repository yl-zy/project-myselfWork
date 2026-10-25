"""知识库检索：加载 app/knowledge 下的 md 语料，关键词匹配召回

模拟版 RAG 的「检索」环节：不引向量数据库和 Embedding，直接用条目标注的
关键词做包含匹配打分。类比前端：相当于给每篇文档手写 tags，然后做 includes 过滤。

语料格式（每个 md 文件内可写多个条目）：

    ## 条目标题
    keywords: 关键词1, 关键词2
    条目正文（markdown）...
"""

from dataclasses import dataclass, field
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "knowledge"


@dataclass
class KnowledgeItem:
    title: str
    keywords: list[str]
    content: str
    source: str  # 来源文件名，用于 sources 展示
    _lower_keywords: list[str] = field(default_factory=list, repr=False)

    def __post_init__(self):
        self._lower_keywords = [k.lower() for k in self.keywords]


def _parse_file(path: Path) -> list[KnowledgeItem]:
    """按 `## ` 标题切分条目，首行 keywords: 为召回关键词"""

    items: list[KnowledgeItem] = []
    current: dict | None = None

    def flush():
        if current and current.get("title"):
            items.append(
                KnowledgeItem(
                    title=current["title"],
                    keywords=current.get("keywords", []),
                    content="\n".join(current.get("body", [])).strip(),
                    source=path.name,
                )
            )

    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            flush()
            current = {"title": line[3:].strip(), "keywords": [], "body": []}
        elif current is not None:
            if line.lower().startswith("keywords:"):
                current["keywords"] = [
                    k.strip() for k in line.split(":", 1)[1].split(",") if k.strip()
                ]
            else:
                current["body"].append(line)
    flush()
    return items


_cache: list[KnowledgeItem] | None = None


def load_items() -> list[KnowledgeItem]:
    """加载全部语料条目，进程内缓存（语料是静态文件，无需每次读盘）"""

    global _cache
    if _cache is None:
        _cache = []
        for md in sorted(KNOWLEDGE_DIR.glob("*.md")):
            _cache.extend(_parse_file(md))
    return _cache


def search(question: str, top_k: int = 3) -> list[KnowledgeItem]:
    """关键词包含匹配打分，返回 top_k 个命中条目；一个都没命中返回空列表"""

    q = question.lower()
    scored = []
    for item in load_items():
        score = sum(1 for kw in item._lower_keywords if kw in q)
        if score > 0:
            scored.append((score, item))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _, item in scored[:top_k]]
