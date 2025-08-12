require("dotenv").config();

const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/azure-service-bus-adapter");
const {
  ServiceBusClient,
  ServiceBusAdministrationClient,
} = require("@azure/service-bus");

const connectionString =
  process.env.AZURE_SERVICEBUS_CONNECTION_STRING ||
  process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
if (!connectionString) {
  console.error("Missing AZURE_SERVICEBUS_CONNECTION_STRING env var");
  process.exit(1);
}

const topic = process.env.SERVICEBUS_TOPIC || "socket.io";
const subscription =
  process.env.SERVICEBUS_SUBSCRIPTION ||
  `svr-a-${Math.random().toString(36).slice(2, 7)}`;

const adminClient = new ServiceBusAdministrationClient(connectionString);
const sbClient = new ServiceBusClient(connectionString);

const io = new Server(3000, {
  cors: { origin: "*" },
  adapter: createAdapter(sbClient, adminClient, { topic, subscription }),
});

if (typeof io.of("/").adapter.init === "function") {
  io.of("/")
    .adapter.init()
    .catch((err) => {
      console.error("[svr-a] adapter init error", err);
    });
}

io.on("connection", (socket) => {
  console.log("[svr-a] client connected", socket.id);
  socket.join("room1");
  socket.on("ping", (data) => {
    console.log("[svr-a] received ping:", data);
    socket.emit("pong", { server: "a", data });
  });
});

io.on("hello", (...args) => {
  console.log("[svr-a] server:hello", ...args);
});

io.on("any", (...args) => {
  console.log("[svr-a] any", ...args);
});

// Listen for adapter events (these show when the adapter receives messages)
io.of("/").adapter.on("broadcast", (packet, opts) => {
  console.log(
    "[svr-a] adapter received broadcast:",
    packet.data[0],
    packet.data.slice(1)
  );
});

io.of("/").adapter.on("join", (id, room) => {
  console.log("[svr-a] adapter join:", id, "->", room);
});

io.of("/").adapter.on("leave", (id, room) => {
  console.log("[svr-a] adapter leave:", id, "->", room);
});

console.log(
  `[svr-a] listening on http://localhost:3000 (topic=${topic}, sub=${subscription})`
);
