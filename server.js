
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const WORLD_LIMIT = 2500;

const players = new Map();

const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;

    if (pathname !== "/" && pathname !== "/index.html") {
        res.writeHead(404);
        return res.end("Not found");
    }

    fs.readFile(path.join(__dirname, "index.html"), (err, data) => {
        if (err) {
            res.writeHead(500);
            return res.end("Game file missing");
        }

        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache"
        });

        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });

function cleanName(value) {
    return String(value || "Player")
        .replace(/[<>]/g, "")
        .trim()
        .slice(0, 16) || "Player";
}

function cleanColor(value) {
    if (value === "rainbow") return "rainbow";

    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
        return value;
    }

    return "#00eaff";
}

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

wss.on("connection", (ws) => {
    const id = crypto.randomUUID();

    const player = {
        id,
        name: "Player",
        color: "#00eaff",
        x: 2500,
        y: 2500,
        joined: Date.now()
    };

    players.set(id, player);

    send(ws, {
        type: "welcome",
        id,
        players: Array.from(players.values())
    });

    ws.on("message", (raw) => {
        if (raw.length > 2048) return;

        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        if (data.type !== "update") return;

        player.name = cleanName(data.name);
        player.color = cleanColor(data.color);

        if (
            Number.isFinite(data.x) &&
            Number.isFinite(data.y)
        ) {
            player.x = Math.max(
                -WORLD_LIMIT,
                Math.min(WORLD_LIMIT, data.x)
            );

            player.y = Math.max(
                -WORLD_LIMIT,
                Math.min(WORLD_LIMIT, data.y)
            );
        }
    });

    ws.on("close", () => {
        players.delete(id);
    });

    ws.on("error", () => {
        players.delete(id);
    });
});

// Broadcast the world 20 times per second.
setInterval(() => {
    const message = JSON.stringify({
        type: "world",
        players: Array.from(players.values())
    });

    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}, 50);

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Tentacle World running on port ${PORT}`);
});
