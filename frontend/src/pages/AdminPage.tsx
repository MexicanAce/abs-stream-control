import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { PlayIcon, StopIcon } from "@heroicons/react/24/solid";

interface VoteUpdate {
  userId: string;
  vote: number;
  totalVotes: number;
}

interface PollResult {
  winningVote: number;
  boxesInRow: number;
  tipUserId?: string;
  tipMessage?: string;
}

interface PollStarted {
  startTime: number;
  duration: number;
  boxesInRow: number;
}

export function AdminPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isPollActive, setIsPollActive] = useState(false);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [pollResult, setPollResult] = useState<PollResult | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [boxesInRow, setBoxesInRow] = useState<number>(2);
  const [pollDuration, setPollDuration] = useState<number>(20);
  const [tipMessage, setTipMessage] = useState<string | null>(null);
  useEffect(() => {
    const newSocket = io("http://localhost:4000");
    setSocket(newSocket);

    newSocket.on("pollStarted", ({ startTime, duration, boxesInRow }: PollStarted) => {
      setIsPollActive(true);
      setVotes({});
      setPollResult(null);
      setTipMessage(null);
      setTimeLeft(duration / 1000);
      setBoxesInRow(boxesInRow);
    });

    newSocket.on("pollEnded", (result: PollResult) => {
      setIsPollActive(false);
      setPollResult(result);
      if (result.tipUserId && result.tipMessage) {
        setTipMessage(
          `${result.tipUserId} ${result.tipMessage} and closed the poll with a vote for box ${result.winningVote}`
        );
      }
      setTimeLeft(0);
    });

    newSocket.on("pollStopped", () => {
      setIsPollActive(false);
      setTimeLeft(0);
    });

    newSocket.on("voteUpdate", (update: VoteUpdate) => {
      setVotes((prev) => ({
        ...prev,
        [update.userId]: update.vote,
      }));
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPollActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPollActive, timeLeft]);

  const startPoll = () => {
    socket?.emit("startPoll", { boxesInRow, duration: pollDuration * 1000 });
  };

  const stopPoll = () => {
    socket?.emit("stopPoll");
  };

  const calculateVoteDistribution = () => {
    const distribution: Record<number, number> = {};
    const totalVotes = Object.values(votes).length;

    // Initialize all possible votes
    for (let i = 1; i <= boxesInRow; i++) {
      distribution[i] = 0;
    }

    // Count votes
    Object.values(votes).forEach((vote) => {
      if (vote >= 1 && vote <= boxesInRow) {
        distribution[vote] = (distribution[vote] || 0) + 1;
      }
    });

    return { distribution, totalVotes };
  };

  const { distribution, totalVotes } = calculateVoteDistribution();

  return (
    <div className="space-y-6">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">
            Poll Controls
          </h3>
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-4">
                <label
                  htmlFor="boxesInRow"
                  className="block text-sm font-medium text-gray-700"
                >
                  Boxes in Row:
                </label>
                <input
                  type="number"
                  id="boxesInRow"
                  value={boxesInRow}
                  onChange={(e) => setBoxesInRow(parseInt(e.target.value))}
                  className="block w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  disabled={isPollActive}
                />
              </div>
              <div className="flex items-center space-x-4">
                <label
                  htmlFor="pollDuration"
                  className="block text-sm font-medium text-gray-700"
                >
                  Duration (seconds):
                </label>
                <input
                  type="number"
                  id="pollDuration"
                  value={pollDuration}
                  onChange={(e) => setPollDuration(parseInt(e.target.value))}
                  className="block w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  disabled={isPollActive}
                />
              </div>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={startPoll}
                disabled={isPollActive}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <PlayIcon className="h-5 w-5 mr-2" />
                Start Poll
              </button>
              <button
                onClick={stopPoll}
                disabled={!isPollActive}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
              >
                <StopIcon className="h-5 w-5 mr-2" />
                Stop Poll
              </button>
            </div>
          </div>
        </div>
      </div>

      {isPollActive && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Active Poll
            </h3>
            <div className="mt-2">
              <p className="text-sm text-gray-500">
                Time remaining: {timeLeft} seconds
              </p>
              <p className="text-sm text-gray-500">Total votes: {totalVotes}</p>
            </div>
          </div>
        </div>
      )}

      {(isPollActive || pollResult) && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              {isPollActive
                ? "Live Vote Distribution"
                : `Poll Results: Box ${pollResult?.winningVote} won!`}
            </h3>
            {tipMessage && (
              <p className="text-md text-gray-500">{tipMessage}</p>
            )}
            <div className="mt-4 space-y-4">
              {Object.entries(distribution).map(([vote, count]) => {
                const percentage =
                  totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                return (
                  <div key={vote} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Box {vote}</span>
                      <span className="text-gray-900 font-medium">
                        {count} votes ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
