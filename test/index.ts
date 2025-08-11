import expect from "expect.js";
import { Emitter } from "../dist";
import { decode as msgpackDecode } from "notepack.io";

type SentMessage = {
  body: any;
  contentType: string;
  subject: string;
};

describe("emitter (Service Bus)", () => {
  let emitter: Emitter;
  let sentMessages: SentMessage[];
  let fakeSender: any;

  beforeEach(() => {
    sentMessages = [];
    fakeSender = {
      sendMessages: async (msg: SentMessage) => {
        sentMessages.push(msg);
      },
    } as any;
    emitter = new Emitter(fakeSender as any);
  });

  it("should be able to emit any kind of data", () => {
    const buffer = Buffer.from("asdfasdf", "utf8");
    const arraybuffer = Uint8Array.of(1, 2, 3, 4).buffer;

    emitter.emit("payload", 1, "2", [3], buffer, arraybuffer);

    expect(sentMessages.length).to.be(1);
    const msg = sentMessages[0];
    expect(msg.contentType).to.be("application/octet-stream");
    expect(msg.subject).to.be("socket.io#/#");
    const decoded = msgpackDecode(msg.body);
    const [uid, packet, opts] = decoded as [string, any, any];
    expect(uid).to.be("emitter");
    expect(packet.type).to.be(2); // PacketType.EVENT
    expect(packet.nsp).to.be("/");
    expect(packet.data[0]).to.be("payload");
    expect(packet.data[1]).to.be(1);
    expect(packet.data[2]).to.be("2");
    expect(packet.data[3]).to.eql([3]);
    expect(Buffer.isBuffer(packet.data[4])).to.be(true);
    expect((packet.data[4] as Buffer).equals(buffer)).to.be(true);
    expect(Buffer.isBuffer(packet.data[5])).to.be(true);
    expect((packet.data[5] as Buffer).equals(Buffer.from(arraybuffer))).to.be(
      true,
    );
    expect(opts.rooms).to.eql([]);
    expect(opts.except).to.eql([]);
  });

  it("should support the toJSON() method", () => {
    // @ts-ignore
    BigInt.prototype.toJSON = function () {
      return String(this);
    };

    // @ts-ignore
    Set.prototype.toJSON = function () {
      return [...this];
    };

    class MyClass {
      toJSON() {
        return 4;
      }
    }

    // @ts-ignore
    emitter.emit("payload", 1n, new Set(["2", 3]), new MyClass());

    expect(sentMessages.length).to.be(1);
    const [_, packet] = msgpackDecode(sentMessages[0].body) as [string, any];
    expect(packet.data[0]).to.be("payload");
    expect(packet.data[1]).to.be("1");
    expect(packet.data[2]).to.eql(["2", 3]);
    expect(packet.data[3]).to.be(4);
  });

  it("should support all broadcast modifiers", () => {
    emitter.in(["room1", "room2"]).emit("test");
    emitter.except(["room4", "room5"]).emit("test");
    emitter.volatile.emit("test");
    emitter.compress(false).emit("test");
    expect(() => emitter.emit("connect" as any)).to.throwError();

    // verify last emit had compress flag set to false
    const [, , lastOpts] = msgpackDecode(
      sentMessages[sentMessages.length - 1].body,
    ) as [string, any, any];
    expect(lastOpts.flags.compress).to.be(false);
  });

  describe("in namespaces", () => {
    it("should be able to emit message to namespace", () => {
      emitter.of("/custom").emit("broadcast event", "broadcast payload");
      expect(sentMessages.length).to.be(1);
      expect(sentMessages[0].subject).to.be("socket.io#/custom#");
      const [, packet] = msgpackDecode(sentMessages[0].body) as [string, any];
      expect(packet.nsp).to.be("/custom");
      expect(packet.data).to.eql(["broadcast event", "broadcast payload"]);
    });

    it("should prepend a missing / to the namespace name", () => {
      const base = new Emitter(fakeSender as any);
      const custom = base.of("custom"); // missing "/"
      expect(base.nsp).to.eql("/");
      expect(custom.nsp).to.eql("/custom");
    });
  });

  describe("in rooms", () => {
    it("should be able to emit to a room", () => {
      emitter.to("room1").emit("broadcast event", "broadcast payload");
      expect(sentMessages.length).to.be(1);
      const msg = sentMessages[0];
      expect(msg.subject).to.be("socket.io#/#room1#");
      const [, , opts] = msgpackDecode(msg.body) as [string, any, any];
      expect(opts.rooms).to.eql(["room1"]);
    });

    it("should be able to emit to a socket by id", () => {
      emitter.to("socket-123").emit("broadcast event", "broadcast payload");
      expect(sentMessages.length).to.be(1);
      expect(sentMessages[0].subject).to.be("socket.io#/#socket-123#");
    });

    it("should be able to exclude a socket by id", () => {
      emitter.except("socket-456").emit("broadcast event", "broadcast payload");
      expect(sentMessages.length).to.be(1);
      const [, , opts] = msgpackDecode(sentMessages[0].body) as [
        string,
        any,
        any,
      ];
      expect(opts.except).to.eql(["socket-456"]);
    });
  });

  describe("utility methods", () => {
    describe("socketsJoin", () => {
      it("makes all socket instances join the given room", () => {
        emitter.socketsJoin("room1");
        expect(sentMessages.length).to.be(1);
        const msg = sentMessages[0];
        expect(msg.subject).to.be("socket.io-request#/#");
        const body = JSON.parse(msg.body as string);
        expect(body.type).to.be(2); // REMOTE_JOIN
        expect(body.rooms).to.eql(["room1"]);
        expect(body.opts.rooms).to.eql([]);
      });

      it("makes all socket instances in a room join the given room", () => {
        emitter.in("room1").socketsJoin("room3");
        expect(sentMessages.length).to.be(1);
        const body = JSON.parse(sentMessages[0].body as string);
        expect(body.type).to.be(2); // REMOTE_JOIN
        expect(body.rooms).to.eql(["room3"]);
        expect(body.opts.rooms).to.eql(["room1"]);
      });
    });

    describe("socketsLeave", () => {
      it("makes all socket instances leave the given room", () => {
        emitter.socketsLeave("room1");
        expect(sentMessages.length).to.be(1);
        const msg = sentMessages[0];
        expect(msg.subject).to.be("socket.io-request#/#");
        const body = JSON.parse(msg.body as string);
        expect(body.type).to.be(3); // REMOTE_LEAVE
        expect(body.rooms).to.eql(["room1"]);
      });

      it("makes all socket instances in a room leave the given room", () => {
        emitter.in("room2").socketsLeave("room1");
        expect(sentMessages.length).to.be(1);
        const body = JSON.parse(sentMessages[0].body as string);
        expect(body.type).to.be(3); // REMOTE_LEAVE
        expect(body.rooms).to.eql(["room1"]);
        expect(body.opts.rooms).to.eql(["room2"]);
      });
    });

    describe("disconnectSockets", () => {
      it("makes all socket instances disconnect", () => {
        emitter.disconnectSockets(true);
        expect(sentMessages.length).to.be(1);
        const body = JSON.parse(sentMessages[0].body as string);
        expect(body.type).to.be(4); // REMOTE_DISCONNECT
        expect(body.close).to.be(true);
      });

      it("makes all socket instances in a room disconnect", () => {
        emitter.in("room2").disconnectSockets(true);
        expect(sentMessages.length).to.be(1);
        const body = JSON.parse(sentMessages[0].body as string);
        expect(body.type).to.be(4); // REMOTE_DISCONNECT
        expect(body.opts.rooms).to.eql(["room2"]);
        expect(body.close).to.be(true);
      });
    });

    describe("serverSideEmit", () => {
      it("sends an event to other server instances", () => {
        emitter.serverSideEmit("hello", "world", 1, "2");
        expect(sentMessages.length).to.be(1);
        const msg = sentMessages[0];
        expect(msg.subject).to.be("socket.io-request#/#");
        const body = JSON.parse(msg.body as string);
        expect(body.type).to.be(6); // SERVER_SIDE_EMIT
        expect(body.data).to.eql(["hello", "world", 1, "2"]);
      });
    });
  });
});

require("./custom-parser");
