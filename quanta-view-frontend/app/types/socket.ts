export interface FinnhubTrade {
  s: string;
  p: number;
  t: number;
  v: number;
  c?: string[];
}

export interface Candlestick {
  time: number; // timestamp for the candle's start (in seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FinnhubWebSocketMessage {
  type: 'trade' | 'ping' | 'subscribe' | 'unsubscribe' | string; // 'string' for unknown types
  data?: FinnhubTrade[]; 
  symbol?: string; 
}


// Events emitted by the server to the client
export interface ServerToClientEvents {
  'stock-update': (trades: FinnhubTrade[]) => void;
  'connect': () => void;
  'disconnect': () => void;
  'error': (error: string) => void;
  'initialCandleHistory': (data: {symbol: string, history: Candlestick[] }) => void;
  'candle-completed': (candle: Candlestick) => void;
  'currentFormingCandle': (data: { symbol: string, candle: Candlestick }) => void;
}

// Events emitted by the client to the server
export interface ClientToServerEvents {
  'subscribeToStock': (symbol: string) => void;
  'unsubscribeFromStock': (symbol: string) => void;
}