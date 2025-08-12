import type { DefaultEventsMap, EventNames, EventParams, EventsMap, TypedEventBroadcaster } from "./typed-events";
import type { ServiceBusSender } from "@azure/service-bus";
interface Parser {
    encode: (msg: any) => any;
}
export interface EmitterOptions {
    /**
     * Topic name to use for the Service Bus emitter.
     * @default "socket.io"
     */
    topic?: string;
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
export declare class Emitter<EmitEvents extends EventsMap = DefaultEventsMap> {
    readonly sbSender: ServiceBusSender;
    readonly nsp: string;
    private readonly opts;
    private readonly broadcastOptions;
    constructor(sbSender: ServiceBusSender, opts?: EmitterOptions, nsp?: string);
    /**
     * Return a new emitter for the given namespace.
     *
     * @param nsp - namespace
     * @public
     */
    of(nsp: string): Emitter<EmitEvents>;
    /**
     * Emits to all clients.
     *
     * @return Always true
     * @public
     */
    emit<Ev extends EventNames<EmitEvents>>(ev: Ev, ...args: EventParams<EmitEvents, Ev>): true;
    /**
     * Targets a room when emitting.
     *
     * @param room
     * @return BroadcastOperator
     * @public
     */
    to(room: string | string[]): BroadcastOperator<EmitEvents>;
    /**
     * Targets a room when emitting.
     *
     * @param room
     * @return BroadcastOperator
     * @public
     */
    in(room: string | string[]): BroadcastOperator<EmitEvents>;
    /**
     * Excludes a room when emitting.
     *
     * @param room
     * @return BroadcastOperator
     * @public
     */
    except(room: string | string[]): BroadcastOperator<EmitEvents>;
    /**
     * Sets a modifier for a subsequent event emission that the event data may be lost if the client is not ready to
     * receive messages (because of network slowness or other issues, or because they're connected through long polling
     * and is in the middle of a request-response cycle).
     *
     * @return BroadcastOperator
     * @public
     */
    get volatile(): BroadcastOperator<EmitEvents>;
    /**
     * Sets the compress flag.
     *
     * @param compress - if `true`, compresses the sending data
     * @return BroadcastOperator
     * @public
     */
    compress(compress: boolean): BroadcastOperator<EmitEvents>;
    /**
     * Makes the matching socket instances join the specified rooms
     *
     * @param rooms
     * @public
     */
    socketsJoin(rooms: string | string[]): void;
    /**
     * Makes the matching socket instances leave the specified rooms
     *
     * @param rooms
     * @public
     */
    socketsLeave(rooms: string | string[]): void;
    /**
     * Makes the matching socket instances disconnect
     *
     * @param close - whether to close the underlying connection
     * @public
     */
    disconnectSockets(close?: boolean): void;
    /**
     * Send a packet to the Socket.IO servers in the cluster
     *
     * @param args - any number of serializable arguments
     */
    serverSideEmit(...args: any[]): void;
    private sendMessage;
}
export declare const RESERVED_EVENTS: ReadonlySet<string | Symbol>;
export declare class BroadcastOperator<EmitEvents extends EventsMap> implements TypedEventBroadcaster<EmitEvents> {
    private readonly sbSender;
    private readonly broadcastOptions;
    private readonly rooms;
    private readonly exceptRooms;
    private readonly flags;
    constructor(sbSender: ServiceBusSender, broadcastOptions: BroadcastOptions, rooms?: Set<string>, exceptRooms?: Set<string>, flags?: BroadcastFlags);
    to(room: string | string[]): BroadcastOperator<EmitEvents>;
    in(room: string | string[]): BroadcastOperator<EmitEvents>;
    except(room: string | string[]): BroadcastOperator<EmitEvents>;
    compress(compress: boolean): BroadcastOperator<EmitEvents>;
    get volatile(): BroadcastOperator<EmitEvents>;
    emit<Ev extends EventNames<EmitEvents>>(ev: Ev, ...args: EventParams<EmitEvents, Ev>): true;
    socketsJoin(rooms: string | string[]): void;
    socketsLeave(rooms: string | string[]): void;
    disconnectSockets(close?: boolean): void;
    private sendMessage;
}
export default function emitter<EmitEvents extends EventsMap = DefaultEventsMap>(sbSender: ServiceBusSender, opts?: EmitterOptions): Emitter<EmitEvents>;
export {};
