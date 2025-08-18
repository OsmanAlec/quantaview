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
  process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "ws://localhost:4000/ws";

export default function HomePage() {
  const [stockPrices, setStockPrices] = useState<
    Record<string, StockPriceData>
  >({});
  const [symbolInput, setSymbolInput] = useState("AAPL");
  const [isConnected, setIsConnected] = useState(false);
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>([]);
  const [data, setData] = useState<{ symbol: string } | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [candleHistory, setCandleHistory] = useState<{
    [symbol: string]: Candlestick[];
  }>({});
  const [currentFormingCandles, setCurrentFormingCandles] = useState<{
    [symbol: string]: Candlestick | undefined;
  }>({});

  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    ws.current = new WebSocket(SOCKET_SERVER_URL);

    ws.current.onopen = () => {
      console.log("Connected to WebSocket server");
      setIsConnected(true);

      // Once the connection is open, load and resubscribe
      const stored = localStorage.getItem("userData");
      if (stored) {
        try {
          const data: string[] = JSON.parse(stored);
          data.forEach((symbol) => {
            handleSubscribe(symbol);
          });
        } catch (error) {
          console.error("Failed to parse localStorage data:", error);
        }
      }
    };

    ws.current.onopen = () => {
      console.log("Connected to WebSocket server");
      setIsConnected(true);
    };

    ws.current.onclose = () => {
      console.log("Disconnected");
      setIsConnected(false);
    };

    ws.current.onerror = (err) => console.error("WebSocket error:", err);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "subscription-confirmed":
          setActiveSubscriptions((prev) => {
            // Only add if it's not already there
            if (!prev.includes(data.symbol)) {
              const updated = [...prev, data.symbol];
              // Update localStorage
              localStorage.setItem("userData", JSON.stringify(updated));
              return updated;
            }
            return prev;
          });
          break;

        case "unsubscription-confirmed":
          setActiveSubscriptions((prev) => {
            const updated = prev.filter((s) => s !== data.symbol);
            localStorage.setItem("userData", JSON.stringify(updated));
            return updated;
          });
          setStockPrices((prev) => {
            const copy = { ...prev };
            delete copy[data.symbol];
            return copy;
          });
          setCandleHistory((prev) => {
            const copy = { ...prev };
            delete copy[data.symbol];
            return copy;
          });
          setCurrentFormingCandles((prev) => {
            const copy = { ...prev };
            delete copy[data.symbol];
            return copy;
          });
          break;

        case "search_results":
          setSearchResults(data.results);
          break;

        case "price-update":
          setStockPrices((prev) => ({
            ...prev,
            [data.symbol]: { price: data.price, timestamp: data.timestamp },
          }));
          break;
        case "initialCandleHistory":
          setCandleHistory((prev) => ({
            ...prev,
            [data.symbol]: data.history,
          }));
          break;
        case "candle-completed":
          setCandleHistory((prev) => ({
            ...prev,
            [data.symbol]: [...(prev[data.symbol] || []), data.candle],
          }));
          break;
        case "currentFormingCandle":
          setCurrentFormingCandles((prev) => ({
            ...prev,
            [data.symbol]: data.candle,
          }));
          break;
        default:
          console.warn("Unknown WS message:", data);
      }
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  const handleSubscribe = useCallback((symbol: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "subscribe",
          symbol: symbol,
        })
      );
    }
  }, []);

  const handleUnsubscribe = (symbol: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "unsubscribe",
          symbol: symbol,
        })
      );
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "search",
          query: symbolInput,
        })
      );
    }
  };

  return (
    <div className="p-5">
      <h1 className="text-2xl text-center font-bold">
        Real-Time Stock Tracker
      </h1>
      <form className="flex flex-col" onSubmit={handleSearch}>
        <input
          type="text"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          placeholder="Search by ticker..."
          className="outline-none flex-none rounded-2xl px-5 border-1"
        ></input>
        <button type="submit">Search</button>
      </form>
      {searchResults.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-3">Search Results:</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {searchResults.map((result) => (
              <li
                key={result.symbol}
                className="flex flex-col items-center p-4 border rounded-lg bg-gray-50 shadow-sm"
              >
                <span className="font-bold text-lg text-gray-800">
                  {result.displaySymbol}
                </span>
                <span className="text-sm text-gray-600 text-center">
                  {result.description}
                </span>
                <button
                  onClick={() => handleSubscribe(result.symbol)}
                  className="mt-2 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition"
                >
                  Subscribe
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h2 className="text-xl font-semibold mb-3">Suggested Stocks:</h2>
      <ul className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {suggestedStocks.map((symbol) => (
          <li
            key={symbol}
            className="flex flex-col items-center justify-between p-4 border rounded-lg bg-gray-50 shadow-sm h-24"
          >
            <span className="font-bold text-lg text-gray-800">{symbol}</span>
            <button
              onClick={() => {
                handleSubscribe(symbol);
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
        <ul className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {activeSubscriptions.map((symbol) => (
            <li
              key={symbol}
              className="flex items-center justify-between bg-gray-200 px-3 py-2 rounded-md font-bold flex-1"
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
