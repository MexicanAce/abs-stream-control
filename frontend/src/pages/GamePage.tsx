import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface GameState {
  currentRow: number;
  boxesInRow: number;
  isGameOver: boolean;
  hasWon: boolean;
}

interface VoteUpdate {
  userId: string;
  vote: number;
}

interface PollStarted {
  startTime: number;
  duration: number;
}

interface PollEnded {
  winningVote: number;
}

export function GamePage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    currentRow: 1,
    boxesInRow: 2,
    isGameOver: false,
    hasWon: false,
  });
  const [isPollActive, setIsPollActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [votes, setVotes] = useState<Record<string, number>>({});

  useEffect(() => {
    const newSocket = io('http://localhost:4000');
    setSocket(newSocket);

    newSocket.on('pollStarted', ({ startTime, duration }: PollStarted) => {
      setIsPollActive(true);
      setVotes({});
      setTimeLeft(duration / 1000);
    });

    newSocket.on('pollEnded', ({ winningVote }: PollEnded) => {
      setIsPollActive(false);
      setTimeLeft(0);
      // Here you would implement the logic to click the box in the browser
      // based on the winning vote
    });

    newSocket.on('pollStopped', () => {
      setIsPollActive(false);
      setTimeLeft(0);
    });

    newSocket.on('voteUpdate', ({ userId, vote }: VoteUpdate) => {
      setVotes(prev => ({
        ...prev,
        [userId]: vote
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
        setTimeLeft(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPollActive, timeLeft]);

  const renderBoxes = () => {
    const boxes = [];
    for (let i = 1; i <= gameState.boxesInRow; i++) {
      boxes.push(
        <div
          key={i}
          className="w-16 h-16 bg-blue-500 hover:bg-blue-600 rounded-lg cursor-pointer flex items-center justify-center text-white font-bold"
        >
          {i}
        </div>
      );
    }
    return boxes;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">Game Status</h3>
          <div className="mt-2">
            <p className="text-sm text-gray-500">Current Row: {gameState.currentRow}</p>
            <p className="text-sm text-gray-500">Boxes in Row: {gameState.boxesInRow}</p>
            {gameState.isGameOver && (
              <p className="text-sm font-medium text-red-600">
                Game Over! {gameState.hasWon ? 'You won!' : 'Try again!'}
              </p>
            )}
          </div>
        </div>
      </div>

      {isPollActive && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Voting in Progress</h3>
            <div className="mt-2">
              <p className="text-sm text-gray-500">Time remaining: {timeLeft} seconds</p>
              <p className="text-sm text-gray-500">Total votes: {Object.keys(votes).length}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">Current Row</h3>
          <div className="mt-4 flex space-x-4 justify-center">
            {renderBoxes()}
          </div>
        </div>
      </div>
    </div>
  );
} 