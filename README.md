# The Socket.IO Azure Service Bus Emitter

The `socket-io-azure-service-bus-emitter` package allows you to send events from any Node.js process to multiple Socket.IO servers connected through [socket.io-azure-service-bus-adapter](https://www.npmjs.com/package/socket.io-azure-service-bus-adapter) via **Azure Service Bus**.

> This library **must** be used together with [socket.io-azure-service-bus-adapter](https://www.npmjs.com/package/@socket.io/azure-service-bus-adapter) on your Socket.IO servers.

---

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)

  - [CommonJS](#commonjs)
  - [TypeScript](#typescript)
  - [Typed Events](#typed-events)

- [Emit Cheatsheet](#emit-cheatsheet)
- [API](#api)

  - [new Emitter(sbSender\[, opts\[, nsp\]\])](#new-emittersbsender-opts-nsp)
  - [Emitter#to(room)](#emittertoroomstring--stringbroadcastoperator)
  - [Emitter#in(room)](#emitterinroomstring--stringbroadcastoperator)
  - [Emitter#except(room)](#emitterexceptroomstring--stringbroadcastoperator)
  - [Emitter#of(namespace)](#emitterofnamespacestringemitter)
  - [Emitter#volatile](#emittervolatilebroadcastoperator)
  - [Emitter#compress(compress)](#emittercompresscompressbooleanbroadcastoperator)
  - [Emitter#socketsJoin()](#emittersocketsjoinroomsstring--string)
  - [Emitter#socketsLeave()](#emittersocketsleaveroomsstring--string)
  - [Emitter#disconnectSockets()](#emitterdisconnectsocketscloseboolean)
  - [Emitter#serverSideEmit()](#emitterserversideemitargsany)

- [License](#license)

---

## Installation

```bash
npm install socket-io-azure-service-bus-emitter @azure/service-bus
```

---

## Usage

### CommonJS

```js
const { Emitter } = require("socket-io-azure-service-bus-emitter");
const { ServiceBusClient } = require("@azure/service-bus");

const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
const topicName = "my-topic";

const sbClient = new ServiceBusClient(connectionString);
const sbSender = sbClient.createSender(topicName);

const sbEmitter = new Emitter(sbSender);

setInterval(() => {
  sbEmitter.emit("time", new Date());
}, 5000);
```

### TypeScript

```ts
import { Emitter } from "socket-io-azure-service-bus-emitter";
import { ServiceBusClient } from "@azure/service-bus";

const connectionString = process.env
  .AZURE_SERVICE_BUS_CONNECTION_STRING as string;
const topicName = "my-topic";

const sbClient = new ServiceBusClient(connectionString);
const sbSender = sbClient.createSender(topicName);

const sbEmitter = new Emitter(sbSender);

setInterval(() => {
  sbEmitter.emit("time", new Date());
}, 5000);
```

---

## Emit Cheatsheet

```js
// sending to all clients
sbEmitter.emit(/* ... */);

// sending to all clients in 'room1'
sbEmitter.to("room1").emit(/* ... */);

// sending to all clients in 'room1' except those in 'room2'
sbEmitter.to("room1").except("room2").emit(/* ... */);

// sending to individual socket ID
sbEmitter.to(socketId).emit(/* ... */);

const nsp = sbEmitter.of("/admin");

// sending to all clients in the 'admin' namespace
nsp.emit(/* ... */);

// sending to 'notifications' room in 'admin' namespace
nsp.to("notifications").emit(/* ... */);
```

> **Note:** Acknowledgements are **not** supported yet.

---

## API

### new Emitter(sbSender\[, opts\[, nsp]])

```ts
new Emitter(sbSender: ServiceBusSender, opts?: EmitterOptions, nsp?: string)
```

**Parameters:**

- `sbSender` — a `ServiceBusSender` instance from `@azure/service-bus` (**required**).
- `opts` — optional [`EmitterOptions`](#emitteroptions).
- `nsp` — optional namespace string (defaults to `"/"`). A leading `/` is automatically added if missing.

**Example — constructing with a namespace:**

```js
// create an emitter scoped to the /admin namespace
const ioAdmin = new Emitter(sbSender, "/admin");

// or using of() on an existing emitter
const sbEmitter = new Emitter(sbSender);
const ioAdmin2 = sbEmitter.of("/admin");
```

---

### EmitterOptions

```ts
interface EmitterOptions {
  topic?: string; // Topic name to be used on azure service bus, defaults to "socket.io"
  parser?: { encode: (msg: any) => any }; // defaults to @msgpack/msgpack
}
```

---

### Emitter#to(room: string | string\[]): BroadcastOperator

Send to specific room(s).

### Emitter#in(room: string | string\[]): BroadcastOperator

Alias for `.to()`.

### Emitter#except(room: string | string\[]): BroadcastOperator

Exclude specific room(s).

### Emitter#of(namespace: string): Emitter

Send to a specific namespace.

### Emitter#volatile: BroadcastOperator

Mark the message as volatile (may be dropped if clients are not ready).

### Emitter#compress(compress: boolean): BroadcastOperator

Set compression flag.

### Emitter#socketsJoin(rooms: string | string\[]): void

Make matching sockets join room(s).

### Emitter#socketsLeave(rooms: string | string\[]): void

Make matching sockets leave room(s).

### Emitter#disconnectSockets(close?: boolean): void

Disconnect matching sockets.

### Emitter#serverSideEmit(...args: any\[]): void

Emit a message to **all servers** in the cluster (server-to-server communication).
Acknowledgements are **not** supported.
