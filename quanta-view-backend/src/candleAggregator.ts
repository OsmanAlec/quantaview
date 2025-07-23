import { FinnhubTrade, Candlestick } from './types/socket';
import { Server } from 'socket.io';

// Stores the currently forming candle for each symbol
const currentCandles: { [symbol: string]: Candlestick | undefined } = {};

// Stores a history of completed candles for each symbol
const stockCandleHistory: { [symbol: string]: Candlestick[] } = {};

const CANDLE_INTERVAL_SECONDS = 60; 
const MAX_CANDLE_HISTORY = 500;

/**
 * Normalizes a timestamp to the start of the current candle interval.
 * @param timestampMs The original timestamp in seconds.
 * @param intervalSeconds The candle interval in seconds.
 * @returns The normalized timestamp (start of the candle interval) in seconds.
 */
function normalizeTimestamp(timestamps: number, intervalSeconds: number): number {
  return Math.floor(timestamps / (intervalSeconds)) * (intervalSeconds);
}

/**
 * Processes a new Finnhub trade and updates/completes candlesticks.
 * @param trade The incoming Finnhub trade object.
 * @param io Socket.IO server instance to emit completed candles.
 */
export function processNewTrade(trade: FinnhubTrade, io: Server) {
  const symbol = trade.s;
  const price = trade.p;
  const volume = trade.v;

  // Finnhub timestamps are in seconds, convert to milliseconds
  const tradeTimestampMs = trade.t;
  const currentIntervalStart = normalizeTimestamp(tradeTimestampMs, CANDLE_INTERVAL_SECONDS);

  let currentCandle = currentCandles[symbol];

  // 1. Initialize new candle if not exists or if it's a new interval
  if (!currentCandle || currentCandle.time !== currentIntervalStart) {
    // If there was an old candle, it's now complete (unless it was just initialized)
    if (currentCandle && currentCandle.time < currentIntervalStart) {
      // Old candle is complete. Store it and emit.
      if (!stockCandleHistory[symbol]) {
        stockCandleHistory[symbol] = [];
      }
      stockCandleHistory[symbol].push(currentCandle);

      // Keep history limited
      if (stockCandleHistory[symbol].length > MAX_CANDLE_HISTORY) {
        stockCandleHistory[symbol].shift(); // Remove the oldest
      }

      // Emit the completed candle to all connected clients
      io.emit('candle-completed', currentCandle);
      console.log(`[Candle Aggregator] Emitted completed ${CANDLE_INTERVAL_SECONDS/60}-min candle for ${symbol}:`, currentCandle);
    }

    // Start a new candle for the current interval
    currentCandles[symbol] = {
      time: currentIntervalStart,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: volume || 0 // Ensure volume is a number
    };
    console.log(`[Candle Aggregator] Started new ${CANDLE_INTERVAL_SECONDS/60}-min candle for ${symbol} at ${new Date(currentIntervalStart).toLocaleTimeString()}`);

  } else {
    // 2. Update existing candle
    currentCandle.high = Math.max(currentCandle.high, price);
    currentCandle.low = Math.min(currentCandle.low, price);
    currentCandle.close = price;
    currentCandle.volume += (volume || 0);
  }
}

/**
 * Returns the current in-memory history of completed candles for a symbol.
 * @param symbol The stock symbol.
 * @returns An array of Candlestick objects.
 */
export function getCandleHistory(symbol: string): Candlestick[] {
  return stockCandleHistory[symbol] || [];
}

/**
 * Allows external access to the currently forming candles for debugging or live updates.
 * @returns A map of currently forming candles.
 */
export function getCurrentFormingCandles(): { [symbol: string]: Candlestick | undefined } {
  return currentCandles;
}