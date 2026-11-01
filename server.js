
const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Tentacle World multiplayer server is running!");
});

const wss = new WebSocket.Server({ server });

const players = new Map();
let orbs = [];

const WORLD = 2500;
const START_LENGTH = 35;
const SPACING = 12;

function randomPosition() {
  return {
    x: Math.random() * 1200 - 600,
    y: Math.random() * 1200 - 600
  };
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast() {
  const world = {
    type: "world",
    players: [...players.values()].map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      x: p.x,
      y: p.y,
      length: p.length
    })),
    orbs
  };

  for (const client of wss.clients) {
    send(client, world);
  }
}

function createPlayer(ws, data) {
  const pos = randomPosition();

  const p = {
    id: Math.random().toString(36).slice(2),
    ws,
    name: String(data.name || "Player").slice(0, 16),
    color: data.color || "#00eaff",
    x: pos.x,
    y: pos.y,
    length: START_LENGTH,
    trail: []
  };

  p.trail.push({ x: p.x, y: p.y });
  players.set(p.id, p);

  send(ws, {
    type: "welcome",
    id: p.id,
    players: [...players.values()].map(q => ({
      id: q.id,
      name: q.name,
      color: q.color,
      x: q.x,
      y: q.y,
      length: q.length
    })),
    orbs
  });

  broadcast();
}

function die(p) {
  if (!players.has(p.id)) return;

  const amount = Math.max(15, Math.floor(p.length * 0.8));

  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 100;

    orbs.push({
      id: Math.random().toString(36).slice(2),
      x: Math.max(-WORLD, Math.min(WORLD, p.x + Math.cos(angle) * distance)),
      y: Math.max(-WORLD, Math.min(WORLD, p.y + Math.sin(angle) * distance)),
      color: p.color === "rainbow" ? `hsl(${Math.random() * 360},100%,60%)` : p.color
    });
  }

  players.delete(p.id);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

wss.on("connection", ws => {
  ws.on("message", raw => {
    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type === "join") {
      for (const p of players.values()) {
        if (p.ws === ws) players.delete(p.id);
      }

      createPlayer(ws, data);
      return;
    }

    if (data.type === "update") {
      const p = [...players.values()].find(q => q.ws === ws);
      if (!p) return;

      p.name = String(data.name || p.name).slice(0, 16);
      p.color = data.color || p.color;

      p.x = Math.max(-WORLD, Math.min(WORLD, Number(data.x) || 0));
      p.y = Math.max(-WORLD, Math.min(WORLD, Number(data.y) || 0));

      const last = p.trail[p.trail.length - 1];

      if (!last || distance(last, p) > 5) {
        p.trail.push({ x: p.x, y: p.y });
      }

      const maxTrail = p.length * 3;
      while (p.trail.length > maxTrail) p.trail.shift();
    }
  });

  ws.on("close", () => {
    for (const p of players.values()) {
      if (p.ws === ws) players.delete(p.id);
    }
    broadcast();
  });
});

// Server controls collisions and orb collection.
setInterval(() => {
  const dead = new Set();

  for (const p of players.values()) {
    for (const other of players.values()) {
      if (p.id === other.id || dead.has(other.id)) continue;

      // Head-to-head collision.
      if (distance(p, other) < 22) {
        dead.add(p.id);
        dead.add(other.id);
        continue;
      }

      // Head hitting another player's body.
      for (let i = 0; i < other.trail.length - 2; i += 2) {
        if (distance(p, other.trail[i]) < 19) {
          dead.add(p.id);
          break;
        }
      }
    }
  }

  for (const id of dead) {
    const p = players.get(id);
    if (p) die(p);
  }

  // Collect orbs.
  for (const p of players.values()) {
    for (let i = orbs.length - 1; i >= 0; i--) {
      if (distance(p, orbs[i]) < 23) {
        orbs.splice(i, 1);
        p.length += 2;
      }
    }
  }

  broadcast();
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Tentacle World running on port " + PORT);
});
