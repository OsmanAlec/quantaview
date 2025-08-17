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

const suggestedStocks: string[] = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "TSLA",
  "NVDA",
  "META",
  "NFLX",
  "AMD",
  "INTC",
];

const SOCKET_SERVER_URL =
  process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "ws://localhost:4000";

export default function HomePage() {
  const [stockPrices, setStockPrices] = useState<
    Record<string, StockPriceData>
  >({});
  const [symbolInput, setSymbolInput] = useState("AAPL");
  const [isConnected, setIsConnected] = useState(false);
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>([]);
  const [data, setData] = useState<{ symbol: string } | null>(null);

  const [candleHistory, setCandleHistory] = useState<{
    [symbol: string]: Candlestick[];
  }>({});
  const [currentFormingCandles, setCurrentFormingCandles] = useState<{
    [symbol: string]: Candlestick | undefined;
  }>({});

  const wsConnections = useRef<Record<string, WebSocket>>({});

  useEffect(() => {
    const stored = localStorage.getItem("userData");

    if (stored) {
      setActiveSubscriptions(JSON.parse(stored));
    }

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

          setActiveSubscriptions((prev) => {
            const updated = [...prev, symbol];
            localStorage.setItem("userData", JSON.stringify(updated));
            return updated;
          });
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

  const handleUnsubscribe = useCallback((symbol: string) => {
    if (symbol && wsConnections.current[symbol]) {
      wsConnections.current[symbol].close();
      delete wsConnections.current[symbol];

      setActiveSubscriptions((prev) => {
        const updated = prev.filter((s) => s !== symbol);
        localStorage.setItem("userData", JSON.stringify(updated));
        return updated;
      });

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
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1>Real-Time Stock Tracker</h1>
      <h2 className="text-xl font-semibold mb-3">Suggested Stocks:</h2>
      <ul className="space-y-3">
        {suggestedStocks.map((symbol) => (
          <li
            key={symbol}
            className="flex items-center justify-between p-3 border rounded-lg bg-gray-50 shadow-sm"
          >
            <span className="font-bold text-lg text-gray-800">{symbol}</span>
            <button
              onClick={() => {
                setSymbolInput(symbol);
                handleSubscribe();
              }}
              className="cursor-pointer px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition"
            >
              Subscribe
            </button>
          </li>
        ))}
      </ul>
      <h2 className="text-xl font-semibold mb-3">Active Subscriptions:</h2>
      {activeSubscriptions.length > 0 ? (
        <ul className="space-y-2">
          {activeSubscriptions.map((symbol) => (
            <li
              key={symbol}
              className="flex items-center justify-between bg-gray-200 px-3 py-2 rounded-md font-bold"
            >
              {symbol}
              <button
                onClick={() => handleUnsubscribe(symbol)}
                className="cursor-pointer ml-2 px-2 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500">No active subscriptions.</p>
      )}

      <h2 className="text-xl font-semibold mt-6 mb-3">Live Price:</h2>
      {activeSubscriptions.length > 0 ? (
        <div className="space-y-4">
          {activeSubscriptions.map((symbol) => {
            const data = stockPrices[symbol];
            return (
              <div
                key={symbol}
                className="p-4 border rounded-md bg-gray-50 shadow-sm"
              >
                <h3 className="text-lg font-semibold">{symbol}</h3>
                <p className="text-sm text-gray-700">
                  <strong>Price:</strong> $
                  {data?.price ? data.price.toFixed(2) : "N/A"} (Last Updated:{" "}
                  {data?.timestamp || "N/A"})
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-500">
          No tick-based price data yet. Subscribe to a symbol above.
        </p>
      )}

      <h2 className="text-xl font-semibold mt-6 mb-3">
        Candlestick Data (aggregated backend):
      </h2>
      {activeSubscriptions.length > 0 ? (
        <div className="space-y-4">
          {activeSubscriptions.map((symbol) => {
            const candles = candleHistory[symbol] || [];
            const currentForming = currentFormingCandles[symbol];

            return (
              <div
                key={symbol}
                className="p-4 border rounded-md bg-gray-50 shadow-sm"
              >
                <CandleChart
                  candleHistory={candles}
                  formingCandle={currentForming}
                />

                <h3 className="text-lg font-semibold mt-3">
                  {symbol} Candlesticks
                </h3>

                {candles.length > 0 && (
                  <div className="mt-2">
                    <h4 className="font-medium text-sm mb-1">
                      Completed Candles ({candles.length}):
                    </h4>
                    <ul className="space-y-1 text-sm">
                      {candles.slice(-5).map((c) => (
                        <li key={c.timestamp}>
                          <span
                            className={`font-bold ${
                              c.close >= c.open
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {new Date(c.timestamp).toLocaleTimeString()}:
                          </span>{" "}
                          O:{c.open.toFixed(2)} H:{c.high.toFixed(2)} L:
                          {c.low.toFixed(2)} C:{c.close.toFixed(2)} V:{c.volume}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {currentForming && (
                  <div className="mt-3">
                    <h4 className="font-medium text-sm">
                      Current Forming Candle:
                    </h4>
                    <p
                      className={`text-sm ${
                        currentForming.close >= currentForming.open
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      <span className="font-bold">
                        {new Date(
                          currentForming.timestamp
                        ).toLocaleTimeString()}
                        :
                      </span>{" "}
                      O:{currentForming.open.toFixed(2)} H:
                      {currentForming.high.toFixed(2)} L:
                      {currentForming.low.toFixed(2)} C:
                      {currentForming.close.toFixed(2)} V:
                      {currentForming.volume}
                    </p>
                  </div>
                )}

                {!candles.length && !currentForming && (
                  <p className="text-gray-500 text-sm mt-2">
                    No candlestick data yet for {symbol}.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-500">
          No candlestick data available. Subscribe to symbols to receive data.
        </p>
      )}
    </div>
  );
}
