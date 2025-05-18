import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { StreamChat, Channel, Message, Event } from 'stream-chat';
import { z } from 'zod';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Environment variables validation
const envSchema = z.object({
  STREAM_API_KEY: z.string(),
  STREAM_USER_TOKEN: z.string(),
  STREAM_WALLET_ADDRESS: z.string(),
  STREAMER_ADDRESS: z.string(),
});

const env = envSchema.parse(process.env);

// Initialize Stream Chat client
const chatClient = StreamChat.getInstance(env.STREAM_API_KEY, {
  allowServerSideConnect: true,
});

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

// Connect to Stream Chat
async function connectToStreamChat() {
  try {
    console.log('Connecting to Stream Chat');
    console.log('STREAM_USER_TOKEN', env.STREAM_USER_TOKEN);
    console.log('STREAM_WALLET_ADDRESS', env.STREAM_WALLET_ADDRESS);
    console.log('STREAMER_ADDRESS', env.STREAMER_ADDRESS);
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
      channel.on("message.new", (event: Event) => {
        const message = event.message as Message;
        
        if (currentPoll.isActive && message?.text) {
          const vote = parseInt(message.text);
          if (!isNaN(vote) && vote >= 1 && vote <= currentPoll.boxesInRow) {
            const userId = message.user?.id;
            if (userId && !currentPoll.votes.has(userId)) {
              currentPoll.votes.set(userId, vote);

              if (message.pinned) {
                io.emit('voteUpdateTip', {
                  userId,
                  vote,
                  totalVotes: currentPoll.votes.size
                });
              } else {
                io.emit('voteUpdate', {
                  userId,
                  vote,
                  totalVotes: currentPoll.votes.size
                });
              }
            }
          }
        }
      });
    });
  } catch (error) {
    console.error('Error connecting to Stream Chat:', error);
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('startPoll', ({ boxesInRow, duration }: { boxesInRow: number; duration: number }) => {
    if (!currentPoll.isActive) {
      const pollDuration = Math.min(300000, Math.max(5000, duration || 20000)); // 5s to 5min, default 20s
      currentPoll = {
        isActive: true,
        votes: new Map(),
        startTime: Date.now(),
        duration: pollDuration,
        boxesInRow: boxesInRow
      };
      io.emit('pollStarted', { 
        startTime: currentPoll.startTime, 
        duration: currentPoll.duration,
        boxesInRow: currentPoll.boxesInRow
      });
      
      // End poll after duration
      setTimeout(() => {
        if (currentPoll.isActive) {
          const voteCounts = new Map<number, number>();
          currentPoll.votes.forEach((vote) => {
            if (vote >= 1 && vote <= currentPoll.boxesInRow) {
              voteCounts.set(vote, (voteCounts.get(vote) || 0) + 1);
            }
          });
          
          let maxVotes = 0;
          let winningVote = 1;
          voteCounts.forEach((count, vote) => {
            if (count > maxVotes) {
              maxVotes = count;
              winningVote = vote;
            }
          });
          
          io.emit('pollEnded', { 
            winningVote, 
            voteCounts: Object.fromEntries(voteCounts),
            boxesInRow: currentPoll.boxesInRow
          });
          currentPoll.isActive = false;
        }
      }, currentPoll.duration);
    }
  });

  socket.on('stopPoll', () => {
    if (currentPoll.isActive) {
      currentPoll.isActive = false;
      io.emit('pollStopped');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Admin routes
app.get('/api/poll/status', (req, res) => {
  res.json({
    isActive: currentPoll.isActive,
    votes: Object.fromEntries(currentPoll.votes),
    startTime: currentPoll.startTime,
    duration: currentPoll.duration
  });
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectToStreamChat();
}); 