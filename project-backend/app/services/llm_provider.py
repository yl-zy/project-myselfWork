"""大模型提供方隔离层：对上层（api/chat.py）只暴露 stream_answer 一个函数

设计意图（见数据设计草案 §2.2）：SSE 接口契约不随后端方案变化，
「检索 + 生成」的差异全部收敛在本模块。当前为 mock 实现——基于知识库
关键词检索拼装回答并分块输出，模拟真实 LLM 的流式行为；未来接真实大模型
（OpenAI 兼容 API / Dify）时，新增一个 provider 函数并在 PROVIDERS 注册即可，
接口层与测试都不用改。

配置：环境变量 LLM_PROVIDER=mock（默认）。
"""

from collections.abc import Iterator
from typing import Any, TypedDict

from app.core import config
from app.services.knowledge import search


class StreamEvent(TypedDict):
    type: str  # "token" | "sources"
    data: Any  # token: 文本块；sources: [{title, file}]


def _chunk_text(text: str, size: int = 12) -> Iterator[str]:
    """把完整回答切成小文本块，模拟逐字生成的流式节奏

    块内不含换行时直接输出；真实 LLM 的 token 流本身就是异步分块的，
    前端打字机效果由 SSE 事件间隔自然呈现，这里不需要人为 sleep。
    """

    for i in range(0, len(text), size):
        yield text[i : i + size]


def _mock_stream(question: str) -> Iterator[StreamEvent]:
    """mock provider：检索知识库 → 拼装回答 → 分块吐 token → 吐 sources"""

    hits = search(question)
    if hits:
        answer = hits[0].content
        if len(hits) > 1:
            related = "\n".join(f"- {h.title}" for h in hits[1:])
            answer += f"\n\n---\n相关内容：\n{related}"
        sources = [{"title": h.title, "file": h.source} for h in hits]
    else:
        answer = (
            "这个问题超出了当前知识库的范围。本站知识库目前收录了前端面试高频题"
            "（JavaScript、Vue、React、性能优化、工程化、网络与浏览器），"
            "可以试着问我：「事件循环是什么」「Vue3 响应式原理」「首屏加载优化手段」等。\n\n"
            "（当前为模拟模式：检索本地知识库拼装回答，接入真实大模型后此处将由 LLM 生成。）"
        )
        sources = None

    for chunk in _chunk_text(answer):
        yield {"type": "token", "data": chunk}
    if sources:
        yield {"type": "sources", "data": sources}


PROVIDERS = {
    "mock": _mock_stream,
    # 未来扩展： "openai": _openai_stream, "dify": _dify_stream
}


def stream_answer(question: str) -> Iterator[StreamEvent]:
    """统一入口：按配置分发到具体 provider"""

    provider = PROVIDERS.get(config.LLM_PROVIDER, _mock_stream)
    yield from provider(question)
