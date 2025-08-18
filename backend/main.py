import json
import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import websockets
import finnhub

from candle_aggregator import (
    process_new_trade,
    get_candle_history,
    get_current_forming_candle,
)

load_dotenv()
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
finnhub_client = finnhub.Client(api_key=FINNHUB_API_KEY)

# Create FastAPI app and configure CORS
app = FastAPI()

origins = [
    "http://localhost",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# A class to manage active WebSocket connections and Finnhub streams
class ConnectionManager:
    """
    Manages WebSocket connections and corresponding Finnhub streams.
    This class ensures a single Finnhub connection per symbol,
    broadcasting data to all subscribed clients.
    """
    def __init__(self):
        self.active_finnhub_streams = {}
        self.client_subscriptions = {}

    # Broadcast a message to all clients subscribed to a specific symbol
    async def broadcast_message(self, symbol: str, message: dict):
        if symbol in self.active_finnhub_streams:
            for client_ws in self.active_finnhub_streams[symbol]["clients"]:
                try:
                    await client_ws.send_text(json.dumps(message))
                except WebSocketDisconnect:
                    pass

    # Add a new client to a symbol's subscription list
    async def subscribe(self, websocket: WebSocket, symbol: str):
        if symbol not in self.active_finnhub_streams:
            # If this is the first client for this symbol, start a new stream
            print(f"Starting new Finnhub stream for {symbol}")
            task = asyncio.create_task(self.stream_finnhub(symbol))
            self.active_finnhub_streams[symbol] = {
                "clients": [],
                "task": task
            }

        # Add the new client to the list
        if websocket not in self.active_finnhub_streams[symbol]["clients"]:
            self.active_finnhub_streams[symbol]["clients"].append(websocket)
            print(f"Client subscribed to {symbol}. Total clients: {len(self.active_finnhub_streams[symbol]['clients'])}")

            if websocket not in self.client_subscriptions:
                self.client_subscriptions[websocket] = []
            self.client_subscriptions[websocket].append(symbol)

    # Remove a client and stop the stream if no clients remain
    async def unsubscribe(self, websocket: WebSocket, symbol: str):
        if symbol in self.active_finnhub_streams:
            clients = self.active_finnhub_streams[symbol]["clients"]
            if websocket in clients:
                clients.remove(websocket)
                print(f"Client unsubscribed from {symbol}.")
            
            # If no clients are left for this symbol, cancel the Finnhub stream
            if not clients:
                print(f"No more clients for {symbol}, stopping stream.")
                self.active_finnhub_streams[symbol]["task"].cancel()
                del self.active_finnhub_streams[symbol]

    async def stream_finnhub(self, symbol: str):
        """Connects to Finnhub and streams data for a single symbol."""
        uri = f"wss://ws.finnhub.io?token={FINNHUB_API_KEY}"
        try:
            async with websockets.connect(uri) as ws:
                await ws.send(json.dumps({"type": "subscribe", "symbol": symbol}))
                print(f"Finnhub subscription message sent for {symbol}")

                async for message in ws:
                    data = json.loads(message)
                    if data.get("type") == "trade":
                        trades = data.get("data", [])
                        for trade in trades:
                            await process_new_trade(
                                trade,
                                # Callbacks to broadcast to all subscribed clients
                                on_forming_candle=lambda sym, candle: self.broadcast_message(
                                    sym, {"type": "currentFormingCandle", "symbol": sym, "candle": candle}
                                ),
                                on_completed_candle=lambda sym, candle: self.broadcast_message(
                                    sym, {"type": "candle-completed", "symbol": sym, "candle": candle}
                                )
                            )
                    elif data.get("type") == "ping":
                        await ws.send(json.dumps({"type": "pong"}))
        except asyncio.CancelledError:
            print(f"Finnhub stream task for {symbol} was cancelled.")
        except Exception as e:
            print(f"Error in Finnhub stream for {symbol}: {e}")

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    current_symbol = None
    
    try:
        # Use a while True loop to continuously receive messages
        while True:
            # Receive the message as text
            message = await websocket.receive_text()
            data = json.loads(message)
            msg_type = data.get("type")
            symbol = data.get("symbol", "").upper()

            if msg_type == "subscribe":
                # Add client to the new subscription list
                await manager.subscribe(websocket, symbol)
                current_symbol = symbol
                
                # Send confirmation and initial data
                await websocket.send_text(json.dumps({"type": "subscription-confirmed", "symbol": symbol}))
                
                history = get_candle_history(symbol)
                if history:
                    await websocket.send_text(json.dumps({
                        "type": "initialCandleHistory",
                        "symbol": symbol,
                        "history": history
                    }))
                
                current_candle = get_current_forming_candle(symbol)
                if current_candle:
                    await websocket.send_text(json.dumps({
                        "type": "currentFormingCandle",
                        "symbol": symbol,
                        "candle": current_candle
                    }))

            elif msg_type == "unsubscribe":
                if symbol:
                    await manager.unsubscribe(websocket, symbol)
                    await websocket.send_text(json.dumps({"type": "unsubscription-confirmed", "symbol": symbol}))
                    if current_symbol == symbol:
                        current_symbol = None

            elif msg_type == "search":
                query = data.get("query")
                print(f"Received search query: {query}")
                if query:
                    try:
                        # Use the Finnhub client to perform the lookup
                        search_results = finnhub_client.symbol_lookup(query)
                        # Send the results back to the client
                        await websocket.send_text(json.dumps({
                            "type": "search_results",
                            "query": query,
                            "results": search_results.get("result", [])
                        }))
                    except Exception as e:
                        print(f"Finnhub search error: {e}")
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "Failed to search for symbols. Please try again."
                        }))
            else:
                print(f"Unknown message type received: {msg_type}")
                
    except WebSocketDisconnect:
        print(f"Client disconnected.")
        # Ensure cleanup on disconnect
        if current_symbol:
            await manager.unsubscribe(websocket, current_symbol)
    except Exception as e:
        print(f"Unexpected error: {e}")