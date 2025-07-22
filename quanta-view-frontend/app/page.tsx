"use client"; 

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  FinnhubTrade,
} from './types/socket'; 

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;


const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000';
const socket: AppSocket = io(SOCKET_SERVER_URL);

interface StockPriceData {
  price: number;
  timestamp: string;
}

export default function HomePage() {
  const [stockPrices, setStockPrices] = useState<Record<string, StockPriceData>>({});
  const [symbolInput, setSymbolInput] = useState<string>('AAPL');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [activeSubscriptions, setActiveSubscriptions] = useState<Set<string>>(new Set());

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to Socket.IO server!');
      setIsConnected(true);
      // Re-subscribe to any previously active symbols upon reconnect
      activeSubscriptions.forEach(symbol => socket.emit('subscribeToStock', symbol));
    });

    socket.on('stock-update', (trades: FinnhubTrade[]) => {
      trades.forEach(trade => {
        const { s: symbol, p: price, t: timestamp } = trade;
        setStockPrices(prevPrices => ({
          ...prevPrices,
          [symbol]: { price, timestamp: new Date(timestamp).toLocaleTimeString() }
        }));

        console.log(trade);
      });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server.');
      setIsConnected(false);
    });

    socket.on('error', (error: string) => {
      console.error('Socket.IO error:', error);
    });

    return () => {
      console.log('Cleaning up Socket.IO listeners and disconnecting...');
      socket.off('connect');
      socket.off('stock-update');
      socket.off('disconnect');
      socket.off('error');
     
    };
  }, []);

  const handleSubscribe = () => {
    const symbol = symbolInput.toUpperCase();
    if (symbol && !activeSubscriptions.has(symbol)) {
      socket.emit('subscribeToStock', symbol);
      setActiveSubscriptions(prev => new Set(prev).add(symbol));
    }
  };

  const handleUnsubscribe = () => {
    const symbol = symbolInput.toUpperCase();
    if (symbol && activeSubscriptions.has(symbol)) {
      socket.emit('unsubscribeFromStock', symbol);
      setActiveSubscriptions(prev => {
        const newSet = new Set(prev);
        newSet.delete(symbol);
        return newSet;
      });
      setStockPrices(prevPrices => {
        const newPrices = { ...prevPrices };
        delete newPrices[symbol];
        return newPrices;
      });
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Real-Time Stock Tracker </h1>
      <p>Backend Connection Status: {isConnected ? 'Connected' : 'Disconnected'}</p>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          placeholder="AAPL)"
          style={{ padding: '8px', marginRight: '10px', width: '200px' }}
        />
        <button onClick={handleSubscribe} style={{ padding: '8px 15px', cursor: 'pointer', marginRight: '10px' }}>
          Subscribe
        </button>
        <button onClick={handleUnsubscribe} style={{ padding: '8px 15px', cursor: 'pointer', backgroundColor: '#f44336', color: 'white' }}>
          Unsubscribe
        </button>
      </div>

      <h2>Active Subscriptions:</h2>
      {activeSubscriptions.size > 0 ? (
        <ul style={{ listStyleType: 'none', padding: 0 }}>
          {Array.from(activeSubscriptions).map(symbol => (
            <li key={symbol} style={{ display: 'inline-block', background: '#e0e0e0', padding: '5px 10px', borderRadius: '5px', margin: '5px' }}>
              {symbol}
            </li>
          ))}
        </ul>
      ) : (
        <p>No active subscriptions.</p>
      )}

      {Object.keys(stockPrices).length > 0 ? (
        <div>
          {Array.from(activeSubscriptions).map(symbol => { 
            const data = stockPrices[symbol];
            if (!data){
              console.log("No data is within the symbol");
              return null;
            }  else {
              console.log("Data has been found");
            }
            return (
              <div key={symbol} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
                <h2>{symbol}</h2>
                <p>
                  **Price:** ${data.price ? data.price.toFixed(2) : 'N/A'} (Last Updated: {data.timestamp || 'N/A'})
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p>No stock data yet. Subscribe to a symbol above.</p>
      )}
    </div>
  );
}