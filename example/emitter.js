require("dotenv").config();

const { ServiceBusClient } = require("@azure/service-bus");
const { Emitter } = require("socket-io-azure-service-bus-emitter");
const connectionString =
  process.env.AZURE_SERVICEBUS_CONNECTION_STRING ||
  process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
if (!connectionString) {
  console.error("Missing AZURE_SERVICEBUS_CONNECTION_STRING env var");
  process.exit(1);
}

async function main() {
  const sbClient = new ServiceBusClient(connectionString);
  const topic = process.env.SERVICEBUS_TOPIC || "socket.io";
  const sender = sbClient.createSender(topic);

  try {
    // Wait for sender to be ready

    const emitter = new Emitter(sender);

    console.log("[emitter] sending messages...");

    // // broadcast to all namespaces and rooms
    emitter.emit("broadcast event", "hello from emitter");

    // // broadcast to a specific room
    emitter.to("room1").emit("room event", { from: "emitter", room: "room1" });

    // server-side emit to all server instances (adapter will receive it)
    emitter.serverSideEmit("hello", "Hello from emitter on: " + Date.now());

    // housekeeping examples
    emitter.socketsJoin("room2");
    emitter.socketsLeave("room3");
    emitter.in("room4").disconnectSockets(false);

    // Wait a bit for messages to be sent
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("[emitter] messages sent successfully");
  } catch (error) {
    console.error("[emitter] error:", error);
    throw error;
  } finally {
    // Clean up
    try {
      await sender.close();
      await sbClient.close();
    } catch (closeError) {
      console.warn("[emitter] cleanup warning:", closeError.message);
    }
  }
}

main().catch((err) => {
  console.error("[emitter] fatal error:", err);
  process.exit(1);
});
