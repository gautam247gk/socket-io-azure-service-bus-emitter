const { io } = require("socket.io-client");

const a = io("http://localhost:3000");
const b = io("http://localhost:3001");

function wire(name, socket) {
  socket.on("connect", () => {
    console.log(`[client] ${name} connected as ${socket.id} `);
    socket.emit("ping", { name });
  });
  socket.on("pong", (data) => console.log(`[client] ${name} pong:`, data));
  socket.on("broadcast event", (msg) =>
    console.log(`[client] ${name} broadcast:`, msg)
  );
  socket.on("room event", (msg) => console.log(`[client] ${name} room:`, msg));
}

wire("A", a);
wire("B", b);
