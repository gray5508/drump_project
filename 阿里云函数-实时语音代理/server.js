"use strict";

const http = require("http");
const { URL } = require("url");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 9000);
const API_KEY = String(process.env.DASHSCOPE_API_KEY || "").trim();
const REALTIME_URL = process.env.DASHSCOPE_REALTIME_URL
  || "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime";
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS || 10);
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || "https://gray5508.github.io")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "https://gray5508.github.io",
  });
  response.end(JSON.stringify(body));
}

function rejectUpgrade(socket, status, message) {
  const body = Buffer.from(message, "utf8");
  socket.end(
    `HTTP/1.1 ${status}\r\nContent-Type: text/plain; charset=utf-8\r\n`
    + `Content-Length: ${body.length}\r\nConnection: close\r\n\r\n${message}`
  );
}

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.has("*")) return true;
  return Boolean(origin && ALLOWED_ORIGINS.has(origin));
}

function safeClose(socket, code = 1000, reason = "") {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close(code, reason);
  }
}

const server = http.createServer((request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "https://gray5508.github.io",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    response.end();
    return;
  }

  if (request.url === "/" || request.url.startsWith("/health")) {
    json(response, API_KEY ? 200 : 503, {
      ready: Boolean(API_KEY),
      model: "qwen3-asr-flash-realtime",
      region: "cn-beijing",
    });
    return;
  }

  json(response, 404, { error: "Not found" });
});

const browserServer = new WebSocket.Server({ noServer: true, maxPayload: 16 * 1024 * 1024 });

server.on("upgrade", (request, socket, head) => {
  let requestUrl;
  try {
    requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  } catch {
    rejectUpgrade(socket, "400 Bad Request", "请求地址无效");
    return;
  }

  if (requestUrl.pathname !== "/ws/realtime") {
    rejectUpgrade(socket, "404 Not Found", "WebSocket 路径不存在");
    return;
  }
  if (!API_KEY) {
    rejectUpgrade(socket, "503 Service Unavailable", "函数环境变量尚未配置");
    return;
  }
  if (!isAllowedOrigin(request.headers.origin)) {
    rejectUpgrade(socket, "403 Forbidden", "页面来源不在允许列表中");
    return;
  }
  if (browserServer.clients.size >= MAX_CONNECTIONS) {
    rejectUpgrade(socket, "503 Service Unavailable", "当前语音连接数已达到上限");
    return;
  }

  browserServer.handleUpgrade(request, socket, head, (browserSocket) => {
    const upstream = new WebSocket(REALTIME_URL, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      handshakeTimeout: 20000,
      maxPayload: 16 * 1024 * 1024,
    });
    const pending = [];

    browserSocket.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      else if (upstream.readyState === WebSocket.CONNECTING && pending.length < 80) pending.push([data, isBinary]);
    });

    upstream.on("open", () => {
      for (const [data, isBinary] of pending.splice(0)) upstream.send(data, { binary: isBinary });
    });
    upstream.on("message", (data, isBinary) => {
      if (browserSocket.readyState === WebSocket.OPEN) browserSocket.send(data, { binary: isBinary });
    });
    upstream.on("error", (error) => {
      if (browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(JSON.stringify({ type: "proxy.error", message: `千问连接失败：${error.message}` }));
      }
      safeClose(browserSocket, 1011, "上游连接失败");
    });
    browserSocket.on("close", () => safeClose(upstream));
    browserSocket.on("error", () => safeClose(upstream, 1011, "浏览器连接异常"));
    upstream.on("close", () => safeClose(browserSocket));
  });
});

const heartbeat = setInterval(() => {
  for (const socket of browserServer.clients) {
    if (socket.readyState === WebSocket.OPEN) socket.ping();
  }
}, 15000);
heartbeat.unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Voice WebSocket proxy listening on 0.0.0.0:${PORT}`);
});
