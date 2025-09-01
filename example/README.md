# Azure Service Bus Emitter + Socket.IO Adapter example

This example spins up two Socket.IO servers using the Azure Service Bus adapter and a separate process that uses the socket-io-azure-service-bus-emitter to broadcast events across processes.

Requirements:

- An Azure Service Bus namespace with a Topic (default: `socket.io`)
- Environment variable `AZURE_SERVICEBUS_CONNECTION_STRING`

Setup:

1. Build the library in the repo root and install example deps

```
npm run prepack
cd example
npm install
```

2. Export environment variables

```
set AZURE_SERVICEBUS_CONNECTION_STRING=Endpoint=sb://...;SharedAccessKeyName=...;SharedAccessKey=...
set SERVICEBUS_TOPIC=socket.io
```

3. Start the demo (two servers, a sample client and the emitter)

```
npm run demo
```

Or, in separate terminals:

- `npm run servers` to start both servers
- `npm run client` to run a simple client connecting to both
- `npm run emitter` to send messages via the emitter

### Troubleshooting

If you see "Link has been permanently closed" errors, ensure:

1. Your Azure Service Bus connection string is correct
2. The topic exists in your Service Bus namespace
3. Your Service Bus namespace has the required permissions (Send/Listen/Manage)
