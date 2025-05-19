import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { StreamChat, Channel, Message, Event } from "stream-chat";
import { z } from "zod";
import puppeteer, { Browser, Page } from "puppeteer";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});
let browser: Browser;
let deathFunPage: Page;

app.use(cors());
app.use(express.json());

// Environment variables validation
const envSchema = z.object({
  STREAM_API_KEY: z.string(),
  STREAM_USER_TOKEN: z.string(),
  STREAM_WALLET_ADDRESS: z.string(),
  STREAMER_ADDRESS: z.string(),
  DEBUG_MODE: z.string(),
});

const env = envSchema.parse(process.env);

// Initialize Stream Chat client
const chatClient = StreamChat.getInstance(env.STREAM_API_KEY, {
  allowServerSideConnect: true,
});

const MIN_TIP_AMOUNTS = {
  PENGU: 150,
  USDC: 1,
  ETH: 0.0005,
  NOOT: 50,
  ABSTER: 100,
};

// Poll state
interface Poll {
  isActive: boolean;
  votes: Map<string, number>;
  startTime: number;
  duration: number;
  boxesInRow: number;
}

let currentPoll: Poll = {
  isActive: false,
  votes: new Map(),
  startTime: 0,
  duration: 20000, // 20 seconds
  boxesInRow: 2,
};

function isTipAboveMin(tip: string) {
  const tokenNames = "PENGU|USDC|ETH|NOOT|ABSTER";
  const tipRegex = new RegExp(`tipped ([\\d.]+) (${tokenNames})`, "i");
  const match = tip.match(tipRegex);
  if (!match) return false;

  const [, amount, currency] = match;
  const tipAmount = parseFloat(amount);
  const minAmount = MIN_TIP_AMOUNTS[currency as keyof typeof MIN_TIP_AMOUNTS];
  return tipAmount >= minAmount;
}

async function getBoxesInCurrentRow(): Promise<number> {
  if (!browser || !deathFunPage) {
    console.log("No browser or deathFunPage");
    return 0;
  }
  const currentRow = await deathFunPage.$(".ring-primary");
  if (!currentRow) {
    console.log("No current row");
    return 0;
  }
  const boxes = await currentRow.$$("button");
  console.log("Boxes in current row", boxes.length);
  return boxes.length;
}

async function clickBoxInCurrentRow(boxIndex: number) {
  if (!browser || !deathFunPage) {
    console.log("No browser or deathFunPage");
    return;
  }
  const currentRow = await deathFunPage.$(".ring-primary");
  if (!currentRow) {
    console.log("No current row");
    return 0;
  }
  const boxes = await currentRow.$$("button");
  if (boxes.length === 0) {
    console.log("No boxes in current row");
    return;
  }
  const box = boxes[boxIndex];
  await box.click();
}

async function clickCashOut() {
  if (!browser || !deathFunPage) {
    console.log("No browser or deathFunPage");
    return;
  }
  const buttons = await deathFunPage.$$("button");
  for (const button of buttons) {
    const text = await deathFunPage.evaluate(
      (el) => el.textContent?.trim(),
      button
    );
    if (text === "Cash Out") {
      await button.click();
      break;
    }
  }
}

function isVoteForCashOut(messageText: string): boolean {
  return (
    messageText === "cash out" ||
    messageText === "cashout" ||
    messageText === "cash" ||
    (messageText === "gm" && env.DEBUG_MODE === "true")
  );
}

// Connect to Stream Chat
async function connectToStreamChat() {
  try {
    console.log("Connecting to Stream Chat");
    console.log("STREAM_USER_TOKEN", env.STREAM_USER_TOKEN);
    console.log("STREAM_WALLET_ADDRESS", env.STREAM_WALLET_ADDRESS);
    console.log("STREAMER_ADDRESS", env.STREAMER_ADDRESS);
    await chatClient.connectUser(
      {
        id: env.STREAM_WALLET_ADDRESS,
      },
      env.STREAM_USER_TOKEN
    );

    const channels = await chatClient.queryChannels({
      created_by_id: env.STREAMER_ADDRESS,
    });

    channels.forEach((channel: Channel) => {
      channel.on("message.new", async (event: Event) => {
        const message = event.message as Message;

        if (currentPoll.isActive && message?.text) {
          let vote = parseInt(message.text);

          if (isVoteForCashOut(message.text.toLowerCase())) {
            console.log("Vote for Cash Out", message.text, "by", message.user?.id);
            vote = -1;
          }

          if (isNaN(vote) && env.DEBUG_MODE === "true") {
            vote = Math.floor(Math.random() * currentPoll.boxesInRow) + 1;
          }

          if (!isNaN(vote) && vote >= -1 && vote != 0 && vote <= currentPoll.boxesInRow) {
            const userId = message.user?.id;
            if (userId && !currentPoll.votes.has(userId)) {
              currentPoll.votes.set(userId, vote);
              io.emit("voteUpdate", {
                userId,
                vote,
                totalVotes: currentPoll.votes.size,
              });
            }
          }

          // Handle tips
          if (message.pinned) {
            const userId = message.user?.id;
            console.log("WE GOT A PINNED MESSAGE", userId, message.text);
            if (userId && isTipAboveMin(message.text)) {
              const vote = currentPoll.votes.get(userId);
              if (vote) {
                console.log("Vote found for user", vote);
                io.emit("pollEnded", {
                  winningVote: vote,
                  boxesInRow: currentPoll.boxesInRow,
                  tipUserId: userId,
                  tipMessage: message.text,
                });
                currentPoll.isActive = false;
                if (vote > 0) {
                  await clickBoxInCurrentRow(vote - 1);
                } else {
                  await clickCashOut();
                }
                io.emit("pollStopped");
              } else {
                console.log("No vote found for user");
              }
            } else {
              console.log("Tip not above threshold..");
            }
          }
        }
      });
    });
  } catch (error) {
    console.error("Error connecting to Stream Chat:", error);
  }
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on(
    "startPoll",
    async ({
      boxesInRow,
      duration,
    }: {
      boxesInRow: number;
      duration: number;
    }) => {
      if (!currentPoll.isActive) {
        const pollDuration = Math.min(
          300000,
          Math.max(5000, duration || 20000)
        ); // 5s to 5min, default 20s

        let fetchBoxesInRow = await getBoxesInCurrentRow();

        if (fetchBoxesInRow === 0) {
          fetchBoxesInRow = boxesInRow;
        }

        currentPoll = {
          isActive: true,
          votes: new Map(),
          startTime: Date.now(),
          duration: pollDuration,
          boxesInRow: fetchBoxesInRow,
        };
        io.emit("pollStarted", {
          startTime: currentPoll.startTime,
          duration: currentPoll.duration,
          boxesInRow: currentPoll.boxesInRow,
        });

        // End poll after duration
        setTimeout(async () => {
          if (currentPoll.isActive) {
            const voteCounts = new Map<number, number>();
            currentPoll.votes.forEach((vote) => {
              if (vote >= -1 && vote <= currentPoll.boxesInRow) {
                voteCounts.set(vote, (voteCounts.get(vote) || 0) + 1);
              }
            });

            let maxVotes = 0;
            let winningVote = 1;
            let winners: number[] = [];
            voteCounts.forEach((count, vote) => {
              if (count > maxVotes) {
                maxVotes = count;
                winners = [vote];
              } else if (count === maxVotes) {
                winners.push(vote);
              }
            });

            winningVote = winners[Math.floor(Math.random() * winners.length)];

            io.emit("pollEnded", {
              winningVote,
              boxesInRow: currentPoll.boxesInRow,
            });
            if (winningVote > 0) {
              await clickBoxInCurrentRow(winningVote - 1);
            } else {
              console.log(`Vote was ${winningVote} to Cash Out`);
              await clickCashOut();
            }
            currentPoll.isActive = false;
          }
        }, currentPoll.duration);
      }
    }
  );

  socket.on("stopPoll", () => {
    if (currentPoll.isActive) {
      currentPoll.isActive = false;
      io.emit("pollStopped");
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Chrome Browser Management
(async () => {
  const response = await fetch("http://localhost:9222/json/version");
  const data = (await response.json()) as { webSocketDebuggerUrl: string };

  browser = await puppeteer.connect({
    browserWSEndpoint: data.webSocketDebuggerUrl,
    defaultViewport: null,
  });

  const pages = await browser.pages();
  console.log("Connected to Chrome Browser");
  console.log("Open pages:", pages.length);
  deathFunPage =
    pages.find((page) => page.url().includes("death.fun")) || pages[0];
  console.log("Death Fun Page:", deathFunPage.url());
})();

// Admin routes
app.get("/api/poll/status", (req, res) => {
  res.json({
    isActive: currentPoll.isActive,
    votes: Object.fromEntries(currentPoll.votes),
    startTime: currentPoll.startTime,
    duration: currentPoll.duration,
  });
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectToStreamChat();
});
