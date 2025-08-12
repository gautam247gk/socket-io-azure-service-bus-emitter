import { expect } from "chai";
import { Emitter } from "../lib"; // adjust path if needed
import { decode as msgpackDecode } from "@msgpack/msgpack";
import { MessageType } from "socket.io-adapter";
import type { ServiceBusSender } from "@azure/service-bus";

type SentMessage = {
  body: Uint8Array;
  contentType: string;
  applicationProperties: Record<string, any>;
};

describe("Emitter (Service Bus)", () => {
  let emitter: Emitter;
  let sentMessages: SentMessage[];
  let fakeSender: ServiceBusSender;

  beforeEach(() => {
    sentMessages = [];
    fakeSender = {
      sendMessages: async (msg: any) => {
        sentMessages.push(msg);
      },
    } as any;
    emitter = new Emitter(fakeSender);
  });

  function decodeLastMessage(): any {
    expect(sentMessages).to.have.length.greaterThan(0);
    const last = sentMessages[sentMessages.length - 1];
    return msgpackDecode(last.body) as any;
  }

  it("should emit any kind of data", () => {
    const buffer = Buffer.from("asdfasdf", "utf8");

    emitter.emit("payload", buffer);

    expect(sentMessages).to.have.length(1);
    const decoded = decodeLastMessage();

    expect(decoded.uid).to.equal("emitter");
    expect(decoded.type).to.equal(MessageType.BROADCAST);
    expect(decoded.data.packet.type).to.equal(2); // PacketType.EVENT
    expect(decoded.data.packet.nsp).to.equal("/");
    expect(decoded.data.packet.data).to.deep.equal(["payload", buffer]);
    expect(decoded.data.opts.rooms).to.eql([]);
    expect(decoded.data.opts.except).to.eql([]);
  });



  it("should support all broadcast modifiers", () => {
    emitter.in(["room1", "room2"]).emit("test");
    emitter.except(["room4", "room5"]).emit("test");
    emitter.volatile.emit("test");
    emitter.compress(false).emit("test");
    expect(() => emitter.emit("connect" as any)).to.throw();

    const last = decodeLastMessage();
    expect(last.data.opts.flags.compress).to.equal(false);
  });

  describe("namespaces", () => {
    it("should emit to a custom namespace", () => {
      emitter.of("/custom").emit("broadcast event", "payload");
      const decoded = decodeLastMessage();
      expect(decoded.nsp).to.equal("/custom");
      expect(decoded.data.packet.data).to.eql(["broadcast event", "payload"]);
    });

    it("should prepend missing /", () => {
      const base = new Emitter(fakeSender);
      const custom = base.of("custom");
      expect(base.nsp).to.eql("/");
      expect(custom.nsp).to.eql("/custom");
    });
  });

  describe("rooms", () => {
    it("should emit to a room", () => {
      emitter.to("room1").emit("event", "payload");
      const decoded = decodeLastMessage();
      expect(decoded.data.opts.rooms).to.eql(["room1"]);
    });

    it("should exclude a socket by id", () => {
      emitter.except("socket-456").emit("event", "payload");
      const decoded = decodeLastMessage();
      expect(decoded.data.opts.except).to.eql(["socket-456"]);
    });
  });

  describe("utility methods", () => {
    it("socketsJoin should send correct ClusterMessage", () => {
      emitter.socketsJoin("room1");
      const decoded = decodeLastMessage();
      expect(decoded.type).to.equal(MessageType.SOCKETS_JOIN);
      expect(decoded.data.rooms).to.eql(["room1"]);
      expect(decoded.data.opts.rooms).to.eql([]);
    });

    it("socketsLeave should send correct ClusterMessage", () => {
      emitter.socketsLeave("room1");
      const decoded = decodeLastMessage();
      expect(decoded.type).to.equal(MessageType.SOCKETS_LEAVE);
      expect(decoded.data.rooms).to.eql(["room1"]);
    });

    it("disconnectSockets should send correct ClusterMessage", () => {
      emitter.disconnectSockets(true);
      const decoded = decodeLastMessage();
      expect(decoded.type).to.equal(MessageType.DISCONNECT_SOCKETS);
      expect(decoded.data.close).to.equal(true);
    });

    it("serverSideEmit should send correct ClusterMessage", () => {
      emitter.serverSideEmit("hello", "world");
      const decoded = decodeLastMessage();
      expect(decoded.type).to.equal(MessageType.SERVER_SIDE_EMIT);
      expect(decoded.data.packet).to.eql(["hello", "world"]);
    });
  });
});
