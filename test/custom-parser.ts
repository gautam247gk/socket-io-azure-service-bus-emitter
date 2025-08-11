import expect from "expect.js";
import { Emitter } from "../lib";

type SentMessage = {
  body: any;
  contentType: string;
  subject: string;
};

describe("emitter - custom parser", () => {
  let sentMessages: SentMessage[];
  let fakeSender: any;
  let emitter: Emitter;

  beforeEach(() => {
    sentMessages = [];
    fakeSender = {
      sendMessages: async (msg: SentMessage) => {
        sentMessages.push(msg);
      },
    } as any;

    emitter = new Emitter(fakeSender as any, {
      parser: {
        encode(msg) {
          return JSON.stringify(msg);
        },
      },
    });
  });

  it("should be able to emit any kind of data", () => {
    emitter.emit("payload", 1, "2", [3]);

    expect(sentMessages.length).to.be(1);
    const msg = sentMessages[0];
    expect(typeof msg.body).to.be("string");
    const [uid, packet, opts] = JSON.parse(msg.body as string) as [
      string,
      any,
      any
    ];
    expect(uid).to.be("emitter");
    expect(packet.nsp).to.be("/");
    expect(packet.data).to.eql(["payload", 1, "2", [3]]);
    expect(opts.rooms).to.eql([]);
  });
});
