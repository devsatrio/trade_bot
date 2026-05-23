const WebSocket = require('ws');
const ws = new WebSocket('wss://api.hyperliquid.xyz/ws');
ws.on('open', () => {
    ws.send(JSON.stringify({method: "subscribe", subscription: {type: "l2Book", coin: "BTC"}}));
});
ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.channel === 'l2Book') {
        console.log(JSON.stringify(msg, null, 2));
        process.exit(0);
    }
});
