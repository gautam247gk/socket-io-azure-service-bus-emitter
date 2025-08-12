// src/index.ts
import { PacketType } from "socket.io-parser";
import { encode as msgpackEncode } from "@msgpack/msgpack";
import debugModule from "debug";
import type {
  DefaultEventsMap,
  EventNames,
  EventParams,
  EventsMap,
  TypedEventBroadcaster,
} from "./typed-events";
import type { ServiceBusSender } from "@azure/service-bus";
import { ClusterMessage, MessageType } from "socket.io-adapter";

const debug = debugModule("socket.io-emitter-servicebus");

const UID = "emitter";

interface Parser {
  encode: (msg: any) => any;
}

export interface EmitterOptions {
  /**
   * @default "socket.io"
   */
  key?: string;
  /**
   * The parser to use for encoding messages sent to Service Bus.
   * Defaults to @msgpack/msgpack to match the adapter.
   */
  parser?: Parser;
}

interface BroadcastOptions {
  nsp: string;
  broadcastChannel: string;
  requestChannel: string;
  parser: Parser;
}

interface BroadcastFlags {
  volatile?: boolean;
  compress?: boolean;
}

export class Emitter<EmitEvents extends EventsMap = DefaultEventsMap> {
  private readonly opts: EmitterOptions;
  private readonly broadcastOptions: BroadcastOptions;

  constructor(
    readonly sbSender: ServiceBusSender,
    opts?: EmitterOptions,
    readonly nsp: string = "/"
  ) {
    this.opts = Object.assign(
      {
        key: "socket.io",
        parser: { encode: msgpackEncode },
      },
      opts
    );
    this.broadcastOptions = {
      nsp,
      broadcastChannel: this.opts.key + "#" + nsp + "#",
      requestChannel: this.opts.key + "-request#" + nsp + "#",
      parser: this.opts.parser!,
    };
  }

  /**
   * Return a new emitter for the given namespace.
   *
   * @param nsp - namespace
   * @public
   */
  public of(nsp: string): Emitter<EmitEvents> {
    return new Emitter(
      this.sbSender,
      this.opts,
      (nsp[0] !== "/" ? "/" : "") + nsp
    );
  }

  /**
   * Emits to all clients.
   *
   * @return Always true
   * @public
   */
  public emit<Ev extends EventNames<EmitEvents>>(
    ev: Ev,
    ...args: EventParams<EmitEvents, Ev>
  ): true {
    return new BroadcastOperator<EmitEvents>(
      this.sbSender,
      this.broadcastOptions
    ).emit(ev, ...args);
  }

  /**
   * Targets a room when emitting.
   *
   * @param room
   * @return BroadcastOperator
   * @public
   */
  public to(room: string | string[]): BroadcastOperator<EmitEvents> {
    return new BroadcastOperator(this.sbSender, this.broadcastOptions).to(room);
  }
  /**
   * Targets a room when emitting.
   *
   * @param room
   * @return BroadcastOperator
   * @public
   */
  public in(room: string | string[]): BroadcastOperator<EmitEvents> {
    return new BroadcastOperator(this.sbSender, this.broadcastOptions).in(room);
  }

  /**
   * Excludes a room when emitting.
   *
   * @param room
   * @return BroadcastOperator
   * @public
   */
  public except(room: string | string[]): BroadcastOperator<EmitEvents> {
    return new BroadcastOperator(this.sbSender, this.broadcastOptions).except(
      room
    );
  }

  /**
   * Sets a modifier for a subsequent event emission that the event data may be lost if the client is not ready to
   * receive messages (because of network slowness or other issues, or because they're connected through long polling
   * and is in the middle of a request-response cycle).
   *
   * @return BroadcastOperator
   * @public
   */
  public get volatile(): BroadcastOperator<EmitEvents> {
    return new BroadcastOperator(this.sbSender, this.broadcastOptions).volatile;
  }

  /**
   * Sets the compress flag.
   *
   * @param compress - if `true`, compresses the sending data
   * @return BroadcastOperator
   * @public
   */
  public compress(compress: boolean): BroadcastOperator<EmitEvents> {
    return new BroadcastOperator(this.sbSender, this.broadcastOptions).compress(
      compress
    );
  }

  /**
   * Makes the matching socket instances join the specified rooms
   *
   * @param rooms
   * @public
   */
  public socketsJoin(rooms: string | string[]): void {
    return new BroadcastOperator(
      this.sbSender,
      this.broadcastOptions
    ).socketsJoin(rooms);
  }

  /**
   * Makes the matching socket instances leave the specified rooms
   *
   * @param rooms
   * @public
   */
  public socketsLeave(rooms: string | string[]): void {
    return new BroadcastOperator(
      this.sbSender,
      this.broadcastOptions
    ).socketsLeave(rooms);
  }

  /**
   * Makes the matching socket instances disconnect
   *
   * @param close - whether to close the underlying connection
   * @public
   */
  public disconnectSockets(close: boolean = false): void {
    return new BroadcastOperator(
      this.sbSender,
      this.broadcastOptions
    ).disconnectSockets(close);
  }

  /**
   * Send a packet to the Socket.IO servers in the cluster
   *
   * @param args - any number of serializable arguments
   */
  public serverSideEmit(...args: any[]): void {
    const withAck = typeof args[args.length - 1] === "function";
    if (withAck) {
      throw new Error("Acknowledgements are not supported");
    }

    // Create cluster message format for server-side emit
    const clusterMessage: ClusterMessage = {
      uid: UID,
      type: MessageType.SERVER_SIDE_EMIT, // SERVER_SIDE_EMIT
      data: {
        packet: args,
      },
      nsp: this.nsp,
    };

    const msg = this.broadcastOptions.parser.encode(clusterMessage);
    this.sendMessage("", msg);
  }

  private async sendMessage(channel: string, body: any) {
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

export const RESERVED_EVENTS: ReadonlySet<string | Symbol> = new Set([
  "connect",
  "connect_error",
  "disconnect",
  "disconnecting",
  "newListener",
  "removeListener",
]);

export class BroadcastOperator<EmitEvents extends EventsMap>
  implements TypedEventBroadcaster<EmitEvents>
{
  constructor(
    private readonly sbSender: ServiceBusSender,
    private readonly broadcastOptions: BroadcastOptions,
    private readonly rooms: Set<string> = new Set<string>(),
    private readonly exceptRooms: Set<string> = new Set<string>(),
    private readonly flags: BroadcastFlags = {}
  ) {}

  public to(room: string | string[]): BroadcastOperator<EmitEvents> {
    const rooms = new Set(this.rooms);
    (Array.isArray(room) ? room : [room]).forEach((r) => rooms.add(r));
    return new BroadcastOperator(
      this.sbSender,
      this.broadcastOptions,
      rooms,
      this.exceptRooms,
      this.flags
    );
  }

  public in(room: string | string[]): BroadcastOperator<EmitEvents> {
    return this.to(room);
  }

  public except(room: string | string[]): BroadcastOperator<EmitEvents> {
    const exceptRooms = new Set(this.exceptRooms);
    (Array.isArray(room) ? room : [room]).forEach((r) => exceptRooms.add(r));
    return new BroadcastOperator(
      this.sbSender,
      this.broadcastOptions,
      this.rooms,
      exceptRooms,
      this.flags
    );
  }

  public compress(compress: boolean): BroadcastOperator<EmitEvents> {
    const flags = Object.assign({}, this.flags, { compress });
    return new BroadcastOperator(
      this.sbSender,
      this.broadcastOptions,
      this.rooms,
      this.exceptRooms,
      flags
    );
  }

  public get volatile(): BroadcastOperator<EmitEvents> {
    const flags = Object.assign({}, this.flags, { volatile: true });
    return new BroadcastOperator(
      this.sbSender,
      this.broadcastOptions,
      this.rooms,
      this.exceptRooms,
      flags
    );
  }

  public emit<Ev extends EventNames<EmitEvents>>(
    ev: Ev,
    ...args: EventParams<EmitEvents, Ev>
  ): true {
    if (RESERVED_EVENTS.has(ev)) {
      throw new Error(`"${String(ev)}" is a reserved event name`);
    }

    const data = [ev, ...args];
    const packet = {
      type: PacketType.EVENT,
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
    const clusterMessage: ClusterMessage = {
      uid: UID,
      type: MessageType.BROADCAST, // BROADCAST
      data: {
        packet: {
          type: PacketType.EVENT, // PacketType.EVENT
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

  public socketsJoin(rooms: string | string[]): void {
    const clusterMessage: ClusterMessage = {
      uid: UID,
      type: MessageType.SOCKETS_JOIN, // SOCKETS_JOIN
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

  public socketsLeave(rooms: string | string[]): void {
    const clusterMessage: ClusterMessage = {
      uid: UID,
      type: MessageType.SOCKETS_LEAVE, // SOCKETS_LEAVE
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

  public disconnectSockets(close: boolean = false): void {
    const clusterMessage: ClusterMessage = {
      uid: UID,
      type: MessageType.DISCONNECT_SOCKETS, // DISCONNECT_SOCKETS
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

  private async sendMessage(channel: string, body: any) {
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

export default function emitter<
  EmitEvents extends EventsMap = DefaultEventsMap
>(sbSender: ServiceBusSender, opts?: EmitterOptions): Emitter<EmitEvents> {
  return new Emitter(sbSender, opts);
}
