// src/index.ts
import { PacketType } from "socket.io-parser";
import { encode as msgpackEncode } from "notepack.io";
import debugModule from "debug";
import type {
  DefaultEventsMap,
  EventNames,
  EventParams,
  EventsMap,
  TypedEventBroadcaster,
} from "./typed-events";
import type { ServiceBusSender } from "@azure/service-bus";

const debug = debugModule("socket.io-emitter-servicebus");

const UID = "emitter";

/**
 * Request types, for messages between nodes
 */
enum RequestType {
  SOCKETS = 0,
  ALL_ROOMS = 1,
  REMOTE_JOIN = 2,
  REMOTE_LEAVE = 3,
  REMOTE_DISCONNECT = 4,
  REMOTE_FETCH = 5,
  SERVER_SIDE_EMIT = 6,
}

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
   * Defaults to notepack.io, a MessagePack implementation.
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
   * receive messages (because of network slowness or other issues, or because they’re connected through long polling
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

    const request = JSON.stringify({
      uid: UID,
      type: RequestType.SERVER_SIDE_EMIT,
      data: args,
    });

    this.sendMessage(this.broadcastOptions.requestChannel, request);
  }

  private async sendMessage(channel: string, body: any) {
    debug("sending message to channel %s", channel);
    await this.sbSender.sendMessages({
      body,
      contentType: "application/octet-stream",
      subject: channel,
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

    const msg = this.broadcastOptions.parser.encode([UID, packet, opts]);
    let channel = this.broadcastOptions.broadcastChannel;
    if (this.rooms && this.rooms.size === 1) {
      channel += this.rooms.keys().next().value + "#";
    }

    debug("publishing message to channel %s", channel);

    this.sendMessage(channel, msg);
    return true;
  }

  public socketsJoin(rooms: string | string[]): void {
    const request = JSON.stringify({
      type: RequestType.REMOTE_JOIN,
      opts: {
        rooms: [...this.rooms],
        except: [...this.exceptRooms],
      },
      rooms: Array.isArray(rooms) ? rooms : [rooms],
    });

    this.sendMessage(this.broadcastOptions.requestChannel, request);
  }

  public socketsLeave(rooms: string | string[]): void {
    const request = JSON.stringify({
      type: RequestType.REMOTE_LEAVE,
      opts: {
        rooms: [...this.rooms],
        except: [...this.exceptRooms],
      },
      rooms: Array.isArray(rooms) ? rooms : [rooms],
    });

    this.sendMessage(this.broadcastOptions.requestChannel, request);
  }

  public disconnectSockets(close: boolean = false): void {
    const request = JSON.stringify({
      type: RequestType.REMOTE_DISCONNECT,
      opts: {
        rooms: [...this.rooms],
        except: [...this.exceptRooms],
      },
      close,
    });

    this.sendMessage(this.broadcastOptions.requestChannel, request);
  }

  private async sendMessage(channel: string, body: any) {
    debug("sending message to channel %s", channel);
    await this.sbSender.sendMessages({
      body,
      contentType: "application/octet-stream",
      subject: channel,
    });
  }
}

export default function emitter<
  EmitEvents extends EventsMap = DefaultEventsMap,
>(sbSender: ServiceBusSender, opts?: EmitterOptions): Emitter<EmitEvents> {
  return new Emitter(sbSender, opts);
}
