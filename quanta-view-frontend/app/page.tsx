"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import CandleChart from "./_components/CandleChart";

interface Candlestick {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockPriceData {
  price: number;
  timestamp: string;
}

const SOCKET_SERVER_URL =
  process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "ws://localhost:4000";

export default function HomePage() {
  const [stockPrices, setStockPrices] = useState<
    Record<string, StockPriceData>
  >({});
  const [symbolInput, setSymbolInput] = useState("AAPL");
  const [isConnected, setIsConnected] = useState(false);
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>([]);

  const [candleHistory, setCandleHistory] = useState<{
    [symbol: string]: Candlestick[];
  }>({});
  const [currentFormingCandles, setCurrentFormingCandles] = useState<{
    [symbol: string]: Candlestick | undefined;
  }>({});

  const wsConnections = useRef<Record<string, WebSocket>>({});

  useEffect(() => {
    return () => {
      // Close all active connections on unmount
      Object.values(wsConnections.current).forEach((ws) => {
        ws.close();
      });
    };
  }, []);

  const handleSubscribe = useCallback(() => {
    const symbol = symbolInput.toUpperCase();

    if (symbol && !activeSubscriptions.includes(symbol)) {
      try {
        const ws = new WebSocket(`${SOCKET_SERVER_URL}/ws/${symbol}`);
        wsConnections.current[symbol] = ws;

        ws.onopen = () => {
          console.log(`Connected to WebSocket for ${symbol}`);
          setIsConnected(true);

          ws.send(JSON.stringify({ type: "subscribe", symbol: symbol }));

          setActiveSubscriptions((prev) => [...prev, symbol]);
          setCandleHistory((prev) => ({ ...prev, [symbol]: [] }));
          setStockPrices((prev) => ({
            ...prev,
            [symbol]: { price: 0, timestamp: "N/A" },
          }));
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "initialCandleHistory":
              setCandleHistory((prev) => ({
                ...prev,
                [data.symbol]: data.history,
              }));
              break;
            case "candle-completed":
              setCandleHistory((prev) => {
                const existingHistory = prev[data.symbol] || [];
                const lastCandle = existingHistory[existingHistory.length - 1];

                if (
                  lastCandle &&
                  lastCandle.timestamp === data.candle.timestamp
                ) {
                  return prev;
                }

                return {
                  ...prev,
                  [data.symbol]: [...existingHistory, data.candle],
                };
              });
              break;
            case "currentFormingCandle":
              setCurrentFormingCandles((prev) => ({
                ...prev,
                [data.symbol]: data.candle,
              }));
              break;
          }
        };

        ws.onclose = () => {
          console.log(`WebSocket disconnected for ${symbol}`);
          if (Object.keys(wsConnections.current).length === 1) {
            setIsConnected(false);
          }
        };

        ws.onerror = (err) => {
          console.error(`WebSocket error for ${symbol}:`, err);
        };
      } catch (err) {
        console.error("Failed to connect to WebSocket:", err);
      }
    }
  }, [symbolInput, activeSubscriptions]);

  const handleUnsubscribe = useCallback(() => {
    const symbol = symbolInput.toUpperCase();
    if (symbol && wsConnections.current[symbol]) {
      wsConnections.current[symbol].close(); // Cleanup state

      delete wsConnections.current[symbol];
      setActiveSubscriptions((prev) => prev.filter((s) => s !== symbol));
      setStockPrices((prev) => {
        const copy = { ...prev };
        delete copy[symbol];
        return copy;
      });
      setCandleHistory((prev) => {
        const copy = { ...prev };
        delete copy[symbol];
        return copy;
      });
      setCurrentFormingCandles((prev) => {
        const copy = { ...prev };
        delete copy[symbol];
        return copy;
      });
    }
  }, [symbolInput]);

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1>Real-Time Stock Tracker</h1>
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          placeholder="AAPL"
          style={{ padding: 8, marginRight: 10, width: 200 }}
        />
        <button
          onClick={handleSubscribe}
          style={{
            padding: "8px 15px",
            cursor: "pointer",
            marginRight: 10,
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: 4,
          }}
        >
          Subscribe
        </button>
        <button
          onClick={handleUnsubscribe}
          style={{
            padding: "8px 15px",
            cursor: "pointer",
            backgroundColor: "#f44336",
            color: "white",
            border: "none",
            borderRadius: 4,
          }}
        >
          Unsubscribe
        </button>
      </div>
      <h2>Active Subscriptions:</h2>
      {activeSubscriptions.length > 0 ? (
        <ul style={{ listStyleType: "none", padding: 0 }}>
          {activeSubscriptions.map((symbol) => (
            <li
              key={symbol}
              style={{
                display: "inline-block",
                background: "#e0e0e0",
                padding: "5px 10px",
                borderRadius: 5,
                margin: 5,
                fontWeight: "bold",
              }}
            >
              {symbol}
            </li>
          ))}
        </ul>
      ) : (
        <p>No active subscriptions.</p>
      )}
      <h2>Live Price:</h2>
      {activeSubscriptions.length > 0 ? (
        <div>
          {activeSubscriptions.map((symbol) => {
            const data = stockPrices[symbol];
            return (
              <div
                key={symbol}
                style={{
                  marginBottom: 10,
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 5,
                  backgroundColor: "#f9f9f9",
                }}
              >
                <h3>{symbol}</h3>
                <p>
                  <strong>Price:</strong> $
                  {data?.price ? data.price.toFixed(2) : "N/A"} (Last Updated:
                  {data?.timestamp || "N/A"})
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p>No tick-based price data yet. Subscribe to a symbol above.</p>
      )}
      <h2>Candlestick Data (aggregated backend):</h2> 
      {activeSubscriptions.length > 0 ? (
        <div>
          {activeSubscriptions.map((symbol) => {
            const candles = candleHistory[symbol] || [];
            const currentForming = currentFormingCandles[symbol];

            return (
              <div
                key={symbol}
                style={{
                  marginBottom: 10,
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 5,
                  backgroundColor: "#f9f9f9",
                }}
              >
                <CandleChart
                  candleHistory={candles}
                  formingCandle={currentForming}
                />

                <h3>{symbol} Candlesticks</h3>
                {candles.length > 0 && (
                  <div>
                    <h4>Completed Candles ({candles.length}):</h4> 
                    <ul style={{ listStyleType: "none", padding: 0 }}>
                      {candles.slice(-5).map((c) => (
                        <li
                          key={c.timestamp}
                          style={{ marginBottom: 2, fontSize: "0.9em" }}
                        >
                          <span
                            style={{
                              fontWeight: "bold",
                              color: c.close >= c.open ? "green" : "red",
                            }}
                          >
                            {new Date(c.timestamp).toLocaleTimeString()}:
                          </span>
                          O:{c.open.toFixed(2)} H:
                          {c.high.toFixed(2)} L: {c.low.toFixed(2)} C:
                          {c.close.toFixed(2)} V:{c.volume}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {currentForming && (
                  <div>
                    <h4>Current Forming Candle:</h4>
                    <p
                      style={{
                        fontSize: "0.9em",
                        color:
                          currentForming.close >= currentForming.open
                            ? "green"
                            : "red",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>
                        {new Date(
                          currentForming.timestamp
                        ).toLocaleTimeString()}
                        :
                      </span>
                      O:{currentForming.open.toFixed(2)} H:
                      {currentForming.high.toFixed(2)} L:
                      {currentForming.low.toFixed(2)} C:
                      {currentForming.close.toFixed(2)} V:
                      {currentForming.volume}
                    </p>
                  </div>
                )}
                {!candles.length && !currentForming && (
                  <p>No candlestick data yet for {symbol}.</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p>
          No candlestick data available. Subscribe to symbols to receive data.
        </p>
      )}
    </div>
  );
}
