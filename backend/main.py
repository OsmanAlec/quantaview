import json
import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import websockets

from candle_aggregator import (
    process_new_trade,
    get_candle_history,
    get_current_forming_candle,
)

load_dotenv()
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")

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

active_finnhub_streams = {}


@app.websocket("/ws/{symbol}")
async def websocket_endpoint(websocket: WebSocket, symbol: str):
    await websocket.accept()
    print(f"Client connected for {symbol}")

    # Send initial candle history and current forming candle on connection
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
    
    if symbol not in active_finnhub_streams:
        active_finnhub_streams[symbol] = {
            "clients": [websocket],
            "task": asyncio.create_task(stream_finnhub(symbol))
        }
    else:
        active_finnhub_streams[symbol]["clients"].append(websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        print(f"Client disconnected from {symbol}")
        active_finnhub_streams[symbol]["clients"].remove(websocket)
        if not active_finnhub_streams[symbol]["clients"]:
            print(f"No more clients for {symbol}, stopping stream.")
            active_finnhub_streams[symbol]["task"].cancel()
            del active_finnhub_streams[symbol]
    except Exception as e:
        print(f"Error in websocket for {symbol}: {e}")
        

async def stream_finnhub(symbol):
    uri = f"wss://ws.finnhub.io?token={FINNHUB_API_KEY}"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"type": "subscribe", "symbol": symbol}))
        
        try:
            async def broadcast_forming_candle(sym, candle):
                message = {
                    "type": "currentFormingCandle",
                    "symbol": sym,
                    "candle": candle
                }
                for client_ws in active_finnhub_streams[sym]["clients"]:
                    await client_ws.send_text(json.dumps(message))
            
            async def broadcast_completed_candle(sym, candle):
                message = {
                    "type": "candle-completed",
                    "symbol": sym,
                    "candle": candle
                }
                for client_ws in active_finnhub_streams[sym]["clients"]:
                    await client_ws.send_text(json.dumps(message))

            async for message in ws:
                data = json.loads(message)
                
                if data.get("type") == "trade":
                    trades = data.get("data", [])
                    for trade in trades:
                        # Pass both callback functions to the aggregator
                        await process_new_trade(
                            trade, 
                            on_forming_candle=broadcast_forming_candle,
                            on_completed_candle=broadcast_completed_candle
                        )
                
                elif data.get("type") == "ping":
                    await ws.send(json.dumps({"type": "pong"}))

        except asyncio.CancelledError:
            print(f"Finnhub stream for {symbol} cancelled.")
            await ws.send(json.dumps({"type": "unsubscribe", "symbol": symbol}))
            await ws.close()
        except Exception as e:
            print(f"Error in Finnhub stream for {symbol}: {e}")