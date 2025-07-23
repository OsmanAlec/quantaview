"use client";

import { useEffect, useState, useRef } from 'react'; // Import useRef
import { io, Socket } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  FinnhubTrade,
  Candlestick,
} from './types/socket';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000';

interface StockPriceData {
  price: number;
  timestamp: string;
}

export default function HomePage() {
  const [stockPrices, setStockPrices] = useState<Record<string, StockPriceData>>({});
  const [symbolInput, setSymbolInput] = useState<string>('AAPL');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [activeSubscriptions, setActiveSubscriptions] = useState<Set<string>>(new Set());

  const [stockCandles, setStockCandles] = useState<{[symbol: string]: Candlestick[]}>({});
  const [currentFormingCandles, setCurrentFormingCandles] = useState<{[symbol: string]: Candlestick | undefined}>({});

  const socketRef = useRef<AppSocket | null>(null);

  useEffect(() => {
    const newSocket: AppSocket = io(SOCKET_SERVER_URL);
    socketRef.current = newSocket; // Store the socket instance in the ref

    newSocket.on('connect', () => {
      console.log('Connected to Socket.IO server!');
      setIsConnected(true);
      activeSubscriptions.forEach(symbol => newSocket.emit('subscribeToStock', symbol));
    });

    newSocket.on('stock-update', (trades: FinnhubTrade[]) => {
      trades.forEach(trade => {
        const { s: symbol, p: price, t: timestamp } = trade;
        setStockPrices(prevPrices => ({
          ...prevPrices,
          [symbol]: { price, timestamp: new Date(timestamp * 1000).toLocaleTimeString() } // Finnhub timestamp is seconds, convert to MS
        }));
      });
    });

    newSocket.on('initialCandleHistory', (data) => {
      console.log(`Received initial candle history for ${data.symbol}:`, data.history);
      setStockCandles(prev => ({
        ...prev,
        [data.symbol]: data.history
      }));
    });

    newSocket.on('candle-completed', (data: { symbol: string, candle: Candlestick }) => { // Expect symbol from backend
      const { symbol, candle } = data; // Destructure symbol and candle from data
      setStockCandles(prev => {
        const updatedCandles = [...(prev[symbol] || []), candle];
        return { ...prev, [symbol]: updatedCandles.slice(-500) }; // Keep max 500 candles
      });
      setCurrentFormingCandles(prev => {
          const newState = { ...prev };
          delete newState[symbol]; // Remove from forming as it's completed
          return newState;
      });
      console.log(`Received completed candle for ${symbol}:`, candle);
    });

    newSocket.on('currentFormingCandle', (data: { symbol: string, candle: Candlestick }) => {
        console.log(`Received current forming candle for ${data.symbol}:`, data.candle);
        setCurrentFormingCandles(prev => ({
            ...prev,
            [data.symbol]: data.candle
        }));
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server.');
      setIsConnected(false);
    });

    newSocket.on('error', (error) => {
      console.error('Socket.IO error:', error);
    });

    // Cleanup function: This runs when the component unmounts
    return () => {
      console.log('Cleaning up Socket.IO listeners and disconnecting...');
      newSocket.off('connect');
      newSocket.off('stock-update');
      newSocket.off('initialCandleHistory');
      newSocket.off('candle-completed');
      newSocket.off('currentFormingCandle');
      newSocket.off('disconnect');
      newSocket.off('error');
      newSocket.disconnect(); // Disconnect the socket when component unmounts
    };
  }, [activeSubscriptions]); // Dependency array: Re-run effect if activeSubscriptions changes for reconnect logic

  const handleSubscribe = () => {
    const symbol = symbolInput.toUpperCase();
    // Use socketRef.current to access the socket instance
    if (socketRef.current && symbol && !activeSubscriptions.has(symbol)) {
      socketRef.current.emit('subscribeToStock', symbol);
      setActiveSubscriptions(prev => new Set(prev).add(symbol));
      setStockCandles(prev => ({ ...prev, [symbol]: [] }));
      setStockPrices(prevPrices => ({ ...prevPrices, [symbol]: { price: 0, timestamp: 'N/A' } }));
    }
  };

  const handleUnsubscribe = () => {
    const symbol = symbolInput.toUpperCase();
    // Use socketRef.current to access the socket instance
    if (socketRef.current && symbol && activeSubscriptions.has(symbol)) {
      socketRef.current.emit('unsubscribeFromStock', symbol);
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
      setStockCandles(prev => {
        const newCandles = { ...prev };
        delete newCandles[symbol];
        return newCandles;
      });
      setCurrentFormingCandles(prev => {
        const newForming = { ...prev };
        delete newForming[symbol];
        return newForming;
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
          placeholder="AAPL"
          style={{ padding: '8px', marginRight: '10px', width: '200px' }}
        />
        <button onClick={handleSubscribe} style={{ padding: '8px 15px', cursor: 'pointer', marginRight: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}>
          Subscribe
        </button>
        <button onClick={handleUnsubscribe} style={{ padding: '8px 15px', cursor: 'pointer', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px' }}>
          Unsubscribe
        </button>
      </div>

      <h2>Active Subscriptions:</h2>
      {activeSubscriptions.size > 0 ? (
        <ul style={{ listStyleType: 'none', padding: 0 }}>
          {Array.from(activeSubscriptions).map(symbol => (
            <li key={symbol} style={{ display: 'inline-block', background: '#e0e0e0', padding: '5px 10px', borderRadius: '5px', margin: '5px', fontWeight: 'bold' }}>
              {symbol}
            </li>
          ))}
        </ul>
      ) : (
        <p>No active subscriptions.</p>
      )}

      <h2>Live Prices (from tick data):</h2>
      {Object.keys(stockPrices).length > 0 ? (
        <div>
          {Array.from(activeSubscriptions).map(symbol => {
            const data = stockPrices[symbol];
            return (
              <div key={symbol} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #ccc', borderRadius: '5px', backgroundColor: '#f9f9f9' }}>
                <h3>{symbol}</h3>
                <p>
                  <strong>Price:</strong> ${data.price ? data.price.toFixed(2) : 'N/A'} (Last Updated: {data.timestamp || 'N/A'})
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p>No tick-based price data yet. Subscribe to a symbol above.</p>
      )}

      {/* Display Candlestick Data */}
      <h2>Candlestick Data (aggregated backend):</h2>
      {Object.keys(stockCandles).length > 0 || Object.keys(currentFormingCandles).length > 0 ? (
        <div>
          {Array.from(activeSubscriptions).map(symbol => {
            const candles = stockCandles[symbol] || [];
            const currentForming = currentFormingCandles[symbol];

            return (
              <div key={symbol} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #ccc', borderRadius: '5px', backgroundColor: '#f9f9f9' }}>
                <h3>{symbol} Candlesticks</h3>
                {candles.length > 0 && (
                  <div>
                    <h4>Completed Candles ({candles.length}):</h4>
                    <ul style={{ listStyleType: 'none', padding: 0 }}>
                      {candles.slice(-5).map((c) => ( // Show last 5 completed candles
                        <li key={c.time} style={{ marginBottom: '2px', fontSize: '0.9em' }}>
                          <span style={{ fontWeight: 'bold', color: c.close >= c.open ? 'green' : 'red' }}>{new Date(c.time).toLocaleTimeString()}:</span> O:{c.open.toFixed(2)} H:{c.high.toFixed(2)} L:{c.low.toFixed(2)} C:{c.close.toFixed(2)} V:{c.volume}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {currentForming && (
                  <div>
                    <h4>Current Forming Candle:</h4>
                    <p style={{ fontSize: '0.9em', color: currentForming.close >= currentForming.open ? 'green' : 'red' }}>
                      <span style={{ fontWeight: 'bold' }}>{new Date(currentForming.time).toLocaleTimeString()}:</span> O:{currentForming.open.toFixed(2)} H:{currentForming.high.toFixed(2)} L:{currentForming.low.toFixed(2)} C:{currentForming.close.toFixed(2)} V:{currentForming.volume}
                    </p>
                  </div>
                )}
                {!candles.length && !currentForming && <p>No candlestick data yet for {symbol}.</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <p>No candlestick data available. Subscribe to a symbol.</p>
      )}
    </div>
  );
}