from __future__ import annotations

import asyncio
import csv
import json
import os
import pathlib
import secrets
import webbrowser

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web

ROOT = pathlib.Path(__file__).resolve().parent
DEFAULT_KEY_FILE = ROOT.parent.parent / "阿里_api" / "默认业务空间-apiKey-6163534.csv"
KEY_FILE = pathlib.Path(os.getenv("DASHSCOPE_KEY_FILE", str(DEFAULT_KEY_FILE)))
REALTIME_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime"
ACCESS_TOKEN = os.getenv("VOICE_ACCESS_TOKEN", "").strip() or secrets.token_urlsafe(18)


@web.middleware
async def access_control(request: web.Request, handler):
    host = request.host.split(":", 1)[0].lower()
    if host in {"127.0.0.1", "localhost"}:
        return await handler(request)
    supplied = request.query.get("access", "")
    if supplied and secrets.compare_digest(supplied, ACCESS_TOKEN):
        response = web.HTTPFound("/")
        response.set_cookie(
            "voice_access",
            ACCESS_TOKEN,
            max_age=8 * 60 * 60,
            secure=True,
            httponly=True,
            samesite="Strict",
        )
        raise response
    cookie = request.cookies.get("voice_access", "")
    if cookie and secrets.compare_digest(cookie, ACCESS_TOKEN):
        return await handler(request)
    return web.Response(
        text="此语音测试链接需要本次临时访问令牌。",
        status=401,
        content_type="text/plain",
        charset="utf-8",
    )


def load_api_key() -> str:
    if KEY_FILE.exists():
        with KEY_FILE.open("r", encoding="utf-8-sig", newline="") as file:
            row = next(csv.DictReader(file), None)
            if row:
                api_key = next(
                    (str(value).strip() for value in row.values() if str(value).strip().startswith("sk-")),
                    "",
                )
                if api_key:
                    return api_key
    env_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if env_key:
        return env_key
    raise RuntimeError(f"无法从 API 配置文件读取密钥：{KEY_FILE}")


async def index(_request: web.Request) -> web.FileResponse:
    return web.FileResponse(ROOT / "index.html")


async def health(_request: web.Request) -> web.Response:
    try:
        load_api_key()
        return web.json_response(
            {"ready": True, "model": "qwen3-asr-flash-realtime", "region": "cn-beijing"},
            headers={"Cache-Control": "no-store"},
        )
    except Exception as error:
        return web.json_response(
            {"ready": False, "error": str(error)},
            status=503,
            headers={"Cache-Control": "no-store"},
        )


async def realtime_proxy(request: web.Request) -> web.WebSocketResponse:
    browser_socket = web.WebSocketResponse(heartbeat=20, max_msg_size=16 * 1024 * 1024)
    await browser_socket.prepare(request)
    try:
        api_key = load_api_key()
        timeout = ClientTimeout(total=None, connect=20, sock_read=None)
        async with ClientSession(timeout=timeout) as session:
            async with session.ws_connect(
                REALTIME_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                heartbeat=20,
                max_msg_size=16 * 1024 * 1024,
            ) as qwen_socket:

                async def browser_to_qwen() -> None:
                    async for message in browser_socket:
                        if message.type == WSMsgType.TEXT:
                            await qwen_socket.send_str(message.data)
                        elif message.type == WSMsgType.BINARY:
                            await qwen_socket.send_bytes(message.data)
                        elif message.type in {WSMsgType.CLOSE, WSMsgType.CLOSED, WSMsgType.ERROR}:
                            break

                async def qwen_to_browser() -> None:
                    async for message in qwen_socket:
                        if message.type == WSMsgType.TEXT:
                            await browser_socket.send_str(message.data)
                        elif message.type == WSMsgType.BINARY:
                            await browser_socket.send_bytes(message.data)
                        elif message.type in {WSMsgType.CLOSE, WSMsgType.CLOSED, WSMsgType.ERROR}:
                            break

                tasks = {
                    asyncio.create_task(browser_to_qwen()),
                    asyncio.create_task(qwen_to_browser()),
                }
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in pending:
                    task.cancel()
                await asyncio.gather(*done, *pending, return_exceptions=True)
    except Exception as error:
        if not browser_socket.closed:
            await browser_socket.send_str(
                json.dumps({"type": "proxy.error", "message": f"千问实时连接失败：{error}"}, ensure_ascii=False)
            )
    finally:
        if not browser_socket.closed:
            await browser_socket.close()
    return browser_socket


def create_app() -> web.Application:
    app = web.Application(middlewares=[access_control], client_max_size=16 * 1024 * 1024)
    app.router.add_get("/", index)
    app.router.add_get("/api/health", health)
    app.router.add_get("/ws/realtime", realtime_proxy)
    app.router.add_static("/", ROOT, show_index=False, follow_symlinks=False)
    return app


if __name__ == "__main__":
    url = "http://127.0.0.1:8765/"
    print(f"语音交互测试已启动：{url}")
    print(f"本次临时公网访问令牌：{ACCESS_TOKEN}")
    print("关闭此窗口即可停止服务。")
    webbrowser.open(url)
    web.run_app(create_app(), host="127.0.0.1", port=8765, print=None)
