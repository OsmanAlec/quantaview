# Real-time stock portfolio tracker
**Currently initialised** - displays only apple and only last updated price.  
**Socket.io client** used to communicate between the web browser and the server  
**Finnhub API (websocket)** primary data source for real-time stock updates.  

# TODO list:
- add previous prices (historic data)
- add candlesticks
- add more ticker symbols
- create UI to change between active ticker symbols.
- cache data to prevent overuse of API key since it is limited
- cache user data into their browser local storage to keep track of which symbols they have subscribed to already
- finally: host the website online.
