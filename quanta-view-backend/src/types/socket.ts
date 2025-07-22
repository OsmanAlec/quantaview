export interface FinnhubTrade {
  symbol: string;
  price: number;
  timestamp: number;
  volume: number;
  conditions?: string[];
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
}

// Events emitted by the client to the server
export interface ClientToServerEvents {
  'subscribeToStock': (symbol: string) => void;
  'unsubscribeFromStock': (symbol: string) => void;
}