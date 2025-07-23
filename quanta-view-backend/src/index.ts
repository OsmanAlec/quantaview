import express from 'express'; 
import { createServer } from 'http';
import { Server, Socket as SocketIOSocket } from 'socket.io';
import { processNewTrade, getCandleHistory, getCurrentFormingCandles } from './candleAggregator';
import WebSocket from 'ws'; // For Finnhub WebSocket
import dotenv from 'dotenv';

dotenv.config();

import {
  ClientToServerEvents,
  ServerToClientEvents,
  FinnhubTrade,
  FinnhubWebSocketMessage,
} from './types/socket'; 

const app = express();
const httpServer = createServer(app);

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  any
>(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "*", 
    methods: ["GET", "POST"],
  },
});


const activeFinnhubSubscriptions = new Map<string, { ws: WebSocket; refCount: number }>();

io.on("connection", (socket: SocketIOSocket<ClientToServerEvents, ServerToClientEvents>) => {
  console.log(`A client connected to Socket.IO: ${socket.id}`);

  socket.on("subscribeToStock", (symbol: string) => {
    console.log(`Client ${socket.id} subscribing to ${symbol}`);

    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

    if (activeFinnhubSubscriptions.has(symbol)) {
      const sub = activeFinnhubSubscriptions.get(symbol)!;
      sub.refCount++;
      console.log(`Incremented refCount for ${symbol}. New count: ${sub.refCount}`);
    } else {
      const finnhubWs = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);

      finnhubWs.onopen = () => {
        console.log(`Finnhub WebSocket opened for ${symbol}`);
        finnhubWs.send(JSON.stringify({ type: 'subscribe', symbol: symbol }));
      };

      finnhubWs.onmessage = (event) => {
        try {
          const data: FinnhubWebSocketMessage = JSON.parse(event.data.toString());
          if (data.type === 'trade' && data.data) {
            io.emit("stock-update", data.data);
            data.data.forEach(trade => {
              processNewTrade(trade, io);
            });
            }
          else {
            console.log("Finnhub message:" + data.type + data);
          }
        } catch (e) {
          console.error(`Error parsing Finnhub message for ${symbol}:`, e);
        }
      };

      finnhubWs.onerror = (error) => {
        console.error(`Finnhub WebSocket Error for ${symbol}:`, error.message);
        socket.emit("error", `Finnhub connection error for ${symbol}.`);
      };

      finnhubWs.onclose = (event) => {
        console.log(`Finnhub WebSocket closed for ${symbol}: Code ${event.code}`);
        activeFinnhubSubscriptions.delete(symbol);
      };

      activeFinnhubSubscriptions.set(symbol, { ws: finnhubWs, refCount: 1 });
    }

    const history = getCandleHistory(symbol);
    if (history.length > 0){
      socket.emit('initialCandleHistory', { symbol, history });
    }

    const formingCandle = getCurrentFormingCandles()[symbol];
    if (formingCandle){
      socket.emit('currentFormingCandle', { symbol, candle: formingCandle});
    }

  });

  socket.on("unsubscribeFromStock", (symbol: string) => {
    console.log(`Client ${socket.id} unsubscribing from ${symbol}`);

    const sub = activeFinnhubSubscriptions.get(symbol);
    if (sub) {
      sub.refCount--;
      console.log(`Decremented refCount for ${symbol}. New count: ${sub.refCount}`);
      if (sub.refCount <= 0) {
        if (sub.ws.readyState === WebSocket.OPEN) {
            sub.ws.send(JSON.stringify({ type: 'unsubscribe', symbol: symbol }));
            sub.ws.close();
            console.log(`Unsubscribed from Finnhub for ${symbol} due to no active clients.`);
        }
        activeFinnhubSubscriptions.delete(symbol);
      }
    }
  });


  socket.on("disconnect", () => {
    console.log(`Client disconnected from Socket.IO: ${socket.id}`);
    
  });
});

const PORT = process.env.PORT || 4000; 
httpServer.listen(PORT, () => {
  console.log(`Socket.IO backend listening on port ${PORT}`);
});