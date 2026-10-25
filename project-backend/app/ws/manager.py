"""WebSocket 连接管理器：与具体业务无关，后续新增 WS 通道可复用"""

from dataclasses import dataclass

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder


@dataclass
class WSClient:
    websocket: WebSocket
    name: str  # 登录用户名或「访客-n」
    role: str  # admin | demo | guest
    user_id: int | None

    @property
    def can_write(self) -> bool:
        return self.role in ("admin", "demo")


class ConnectionManager:
    def __init__(self) -> None:
        self._clients: dict[WebSocket, WSClient] = {}
        self._guest_seq = 0

    def add(self, client: WSClient) -> None:
        self._clients[client.websocket] = client

    def remove(self, websocket: WebSocket) -> None:
        self._clients.pop(websocket, None)

    def get(self, websocket: WebSocket) -> WSClient | None:
        return self._clients.get(websocket)

    def next_guest_name(self) -> str:
        self._guest_seq += 1
        return f"访客-{self._guest_seq}"

    def online_list(self) -> list[dict]:
        return [{"name": c.name, "role": c.role} for c in self._clients.values()]

    async def broadcast(self, message: dict) -> None:
        """广播给全部在线连接（含发起者本人，本人以服务端消息为准校正本地状态）"""

        for ws in list(self._clients):
            try:
                await ws.send_json(jsonable_encoder(message))
            except Exception:
                self.remove(ws)
