# Stream Control

A web application that allows stream viewers to control a game through chat votes. The application connects to a livestream chat via webhook and enables viewers to vote on game actions through a polling system.

## Features

- Real-time chat integration with Stream Chat
- 20-second voting polls for game actions
- Admin interface for controlling polls
- Real-time vote tracking and results
- WebSocket-based live updates
- Modern React frontend with Tailwind CSS

## Prerequisites

- Node.js (v16 or higher)
- yarn
- Stream Chat API credentials

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd abs-stream-control
```

2. Install dependencies:
```bash
yarn install
```

3. Set up environment variables:
   - Create `backend/.env` (see `Environment Variables` section below)
   - Fill in your Stream Chat credentials and other configuration values

4. Start the development servers:
```bash
yarn dev
```

This will start both the backend server (port 4000) and frontend development server (port 3000).

## Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```
PORT=4000
STREAM_API_KEY=your_api_key_here
STREAM_USER_TOKEN=your_user_token_here
STREAM_WALLET_ADDRESS=your_wallet_address_here
STREAMER_ADDRESS=your_streamer_address_here
```

## How to grab `STREAM_USER_TOKEN`?

1. Log into the Abstract Portal (portal.abs.xyz)
2. Open the network tab in your browser's Dev Tools
3. Open up your stream
4. Filter the network tab for a POST request to `/api/streamer/chat/auth`
5. The response will contain a `token`, that is your `STREAM_USER_TOKEN`

## Usage

1. Access the admin interface at `http://localhost:3000/admin`
2. Use the admin interface to start and stop polls
3. Viewers can vote in chat by typing a number (1-8)
4. The game will automatically execute the most voted action after the poll ends

## Development

- Backend: Express.js with TypeScript
- Frontend: React with TypeScript and Tailwind CSS
- Real-time communication: Socket.IO
- Chat integration: Stream Chat

## License

MIT