# candle_aggregator.py (Corrected version)
from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Any, Callable, Awaitable

# Candle state
candle_history: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
current_forming: Dict[str, Dict[str, Any]] = {}

CANDLE_INTERVAL = 60  # seconds (1-minute candle)

def floor_timestamp_to_interval(ts: int) -> int:
    return ts - (ts % (CANDLE_INTERVAL * 1000))

async def process_new_trade(
    trade: Dict[str, Any], 
    on_forming_candle: Callable,
    on_completed_candle: Callable
):
    symbol = trade['s']
    price = trade['p']
    volume = trade['v']
    timestamp = trade['t']

    bucket_ts = floor_timestamp_to_interval(timestamp)

    candle = current_forming.get(symbol)
    
    if not candle or candle['timestamp'] != bucket_ts:
        # A new candle is starting. The old one is now complete.
        if candle:
            candle_history[symbol].append(candle)
            await on_completed_candle(symbol, candle) # <-- Now correctly awaited
            
        # Create the new forming candle
        candle = {
            'timestamp': bucket_ts,
            'open': price,
            'high': price,
            'low': price,
            'close': price,
            'volume': volume
        }
        current_forming[symbol] = candle
    else:
        # We are still in the same candle interval
        candle['high'] = max(candle['high'], price)
        candle['low'] = min(candle['low'], price)
        candle['close'] = price
        candle['volume'] += volume

    # Send the updated forming candle to the frontend
    await on_forming_candle(symbol, candle) # <-- Now correctly awaited

def get_candle_history(symbol: str) -> List[Dict[str, Any]]:
    history = sorted(candle_history[symbol], key= lambda x: x['timestamp'])
    return history

def get_current_forming_candle(symbol: str) -> Dict[str, Any]:
    return current_forming.get(symbol)