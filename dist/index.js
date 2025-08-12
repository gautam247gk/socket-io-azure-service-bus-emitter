"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastOperator = exports.RESERVED_EVENTS = exports.Emitter = void 0;
exports.default = emitter;
// src/index.ts
const socket_io_parser_1 = require("socket.io-parser");
const msgpack_1 = require("@msgpack/msgpack");
const debug_1 = __importDefault(require("debug"));
const socket_io_adapter_1 = require("socket.io-adapter");
const debug = (0, debug_1.default)("socket.io-emitter-servicebus");
const UID = "emitter";
class Emitter {
    constructor(sbSender, opts, nsp = "/") {
        this.sbSender = sbSender;
        this.nsp = nsp;
        this.opts = Object.assign({
            topic: "socket.io",
            parser: { encode: msgpack_1.encode },
        }, opts);
        this.broadcastOptions = {
            nsp,
            broadcastChannel: this.opts.topic + "#" + nsp + "#",
            requestChannel: this.opts.topic + "-request#" + nsp + "#",
            parser: this.opts.parser,
        };
    }
    /**
     * Return a new emitter for the given namespace.
     *
     * @param nsp - namespace
     * @public
     */
    of(nsp) {
        return new Emitter(this.sbSender, this.opts, (nsp[0] !== "/" ? "/" : "") + nsp);
    }
    /**
     * Emits to all clients.
     *
     * @return Always true
     * @public
     */
    emit(ev, ...args) {
        return new BroadcastOperator(this.sbSender, this.broadcastOptions).emit(ev, ...args);
    }
    /**
     * Targets a room when emitting.
     *
     * @param room
     * @return BroadcastOperator
     * @public
     */
    to(room) {
        return new BroadcastOperator(this.sbSender, this.broadcastOptions).to(room);
    }
    /**
     * Targets a room when emitting.
     *
     * @param room
     * @return BroadcastOperator
     * @public
     */
    in(room) {
        return new BroadcastOperator(this.sbSender, this.broadcastOptions).in(room);
    }
    /**
     * Excludes a room when emitting.
     *
     * @param room
     * @return BroadcastOperator
     * @public
     */
    except(room) {
        return new BroadcastOperator(this.sbSender, this.broadcastOptions).except(room);
    }
    /**
     * Sets a modifier for a subsequent event emission that the event data may be lost if the client is not ready to
     * receive messages (because of network slowness or other issues, or because they're connected through long polling
     * and is in the middle of a request-response cycle).
     *
     * @return BroadcastOperator
     * @public
     */
    get volatile() {
        return new BroadcastOperator(this.sbSender, this.broadcastOptions).volatile;
    }
    /**
     * Sets the compress flag.
     *
     * @param compress - if `true`, compresses the sending data
     * @return BroadcastOperator
     * @public
     */
    compress(compress) {
        return new BroadcastOperator(this.sbSender, this.broadcastOptions).compress(compress);
    }
    /**
     * Makes the matching socket instances join the specified rooms
     *
     * @param rooms
     * @public
     */
    socketsJoin(rooms) {
        return new BroadcastOperator(this.sbSender, this.broadcastOptions).socketsJoin(rooms);
    }
    /**
     * Makes the matching socket instances leave the specified rooms
     *
     * @param rooms
     * @public
     */
    socketsLeave(rooms) {
        return new BroadcastOperator(this.sbSender, this.broadcastOptions).socketsLeave(rooms);
    }
    /**
     * Makes the matching socket instances disconnect
     *
     * @param close - whether to close the underlying connection
     * @public
     */
    disconnectSockets(close = false) {
        return new BroadcastOperator(this.sbSender, this.broadcastOptions).disconnectSockets(close);
    }
    /**
     * Send a packet to the Socket.IO servers in the cluster
     *
     * @param args - any number of serializable arguments
     */
    serverSideEmit(...args) {
        const withAck = typeof args[args.length - 1] === "function";
        if (withAck) {
            throw new Error("Acknowledgements are not supported");
        }
        // Create cluster message format for server-side emit
        const clusterMessage = {
            uid: UID,
            type: socket_io_adapter_1.MessageType.SERVER_SIDE_EMIT, // SERVER_SIDE_EMIT
            data: {
                packet: args,
            },
            nsp: this.nsp,
        };
        const msg = this.broadcastOptions.parser.encode(clusterMessage);
        this.sendMessage("", msg);
    }
    async sendMessage(channel, body) {
        debug("sending message to topic");
        await this.sbSender.sendMessages({
            body,
            contentType: "application/octet-stream",
            applicationProperties: {
                nsp: this.nsp,
                uid: UID,
            },
        });
    }
}
exports.Emitter = Emitter;
exports.RESERVED_EVENTS = new Set([
    "connect",
    "connect_error",
    "disconnect",
    "disconnecting",
    "newListener",
    "removeListener",
]);
class BroadcastOperator {
    constructor(sbSender, broadcastOptions, rooms = new Set(), exceptRooms = new Set(), flags = {}) {
        this.sbSender = sbSender;
        this.broadcastOptions = broadcastOptions;
        this.rooms = rooms;
        this.exceptRooms = exceptRooms;
        this.flags = flags;
    }
    to(room) {
        const rooms = new Set(this.rooms);
        (Array.isArray(room) ? room : [room]).forEach((r) => rooms.add(r));
        return new BroadcastOperator(this.sbSender, this.broadcastOptions, rooms, this.exceptRooms, this.flags);
    }
    in(room) {
        return this.to(room);
    }
    except(room) {
        const exceptRooms = new Set(this.exceptRooms);
        (Array.isArray(room) ? room : [room]).forEach((r) => exceptRooms.add(r));
        return new BroadcastOperator(this.sbSender, this.broadcastOptions, this.rooms, exceptRooms, this.flags);
    }
    compress(compress) {
        const flags = Object.assign({}, this.flags, { compress });
        return new BroadcastOperator(this.sbSender, this.broadcastOptions, this.rooms, this.exceptRooms, flags);
    }
    get volatile() {
        const flags = Object.assign({}, this.flags, { volatile: true });
        return new BroadcastOperator(this.sbSender, this.broadcastOptions, this.rooms, this.exceptRooms, flags);
    }
    emit(ev, ...args) {
        if (exports.RESERVED_EVENTS.has(ev)) {
            throw new Error(`"${String(ev)}" is a reserved event name`);
        }
        const data = [ev, ...args];
        const packet = {
            type: socket_io_parser_1.PacketType.EVENT,
            data,
            nsp: this.broadcastOptions.nsp,
        };
        const opts = {
            rooms: [...this.rooms],
            flags: this.flags,
            except: [...this.exceptRooms],
        };
        // Create cluster message format that adapter expects
        // The adapter expects ClusterMessage format from socket.io-adapter
        const clusterMessage = {
            uid: UID,
            type: socket_io_adapter_1.MessageType.BROADCAST, // BROADCAST
            data: {
                packet: {
                    type: socket_io_parser_1.PacketType.EVENT, // PacketType.EVENT
                    data: packet.data,
                    nsp: packet.nsp,
                },
                opts: {
                    rooms: opts.rooms,
                    flags: opts.flags,
                    except: opts.except,
                },
            },
            nsp: packet.nsp,
        };
        const msg = this.broadcastOptions.parser.encode(clusterMessage);
        // Send to the main topic - the adapter will handle routing based on rooms
        debug("publishing message to topic");
        this.sendMessage("", msg);
        return true;
    }
    socketsJoin(rooms) {
        const clusterMessage = {
            uid: UID,
            type: socket_io_adapter_1.MessageType.SOCKETS_JOIN, // SOCKETS_JOIN
            data: {
                opts: {
                    rooms: [...this.rooms],
                    except: [...this.exceptRooms],
                    flags: this.flags,
                },
                rooms: Array.isArray(rooms) ? rooms : [rooms],
            },
            nsp: this.broadcastOptions.nsp,
        };
        const msg = this.broadcastOptions.parser.encode(clusterMessage);
        this.sendMessage("", msg);
    }
    socketsLeave(rooms) {
        const clusterMessage = {
            uid: UID,
            type: socket_io_adapter_1.MessageType.SOCKETS_LEAVE, // SOCKETS_LEAVE
            data: {
                opts: {
                    rooms: [...this.rooms],
                    except: [...this.exceptRooms],
                    flags: this.flags,
                },
                rooms: Array.isArray(rooms) ? rooms : [rooms],
            },
            nsp: this.broadcastOptions.nsp,
        };
        const msg = this.broadcastOptions.parser.encode(clusterMessage);
        this.sendMessage("", msg);
    }
    disconnectSockets(close = false) {
        const clusterMessage = {
            uid: UID,
            type: socket_io_adapter_1.MessageType.DISCONNECT_SOCKETS, // DISCONNECT_SOCKETS
            data: {
                opts: {
                    rooms: [...this.rooms],
                    except: [...this.exceptRooms],
                    flags: this.flags,
                },
                close,
            },
            nsp: this.broadcastOptions.nsp,
        };
        const msg = this.broadcastOptions.parser.encode(clusterMessage);
        this.sendMessage("", msg);
    }
    async sendMessage(channel, body) {
        debug("sending message to topic");
        await this.sbSender.sendMessages({
            body,
            contentType: "application/octet-stream",
            applicationProperties: {
                nsp: this.broadcastOptions.nsp,
            },
        });
    }
}
exports.BroadcastOperator = BroadcastOperator;
function emitter(sbSender, opts) {
    return new Emitter(sbSender, opts);
}
