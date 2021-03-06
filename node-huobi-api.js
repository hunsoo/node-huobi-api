/**
 * cover from Node Binance API
 * @module jaggedsoft/node-binance-api
 * @return {object} instance to class object
 */

let api = function Huobi(site = 'api.huobi.pro', version) {
    let Huobi = this;

    'use strict';
    const WebSocketAsPromised = require('websocket-as-promised');
    const WebSocket = require('ws');
    const request = require('request');
    const crypto = require('crypto');
    const file = require('fs');
    const url = require('url');
    const pako = require('pako');
    const HttpsProxyAgent = require('https-proxy-agent');
    const SocksProxyAgent = require('socks-proxy-agent');
    //const stringHash = require('string-hash');
    //const async = require('async');
    // const site = site || 'api.huobi.pro';
    const base = 'https://' + site;
    version = version || '';
    const stream = 'wss://' + site + '/ws';
    //const combineStream = 'wss://api.huobi.pro/ws/';
    const userAgent = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.71 Safari/537.36';//'Mozilla/4.0 (compatible; Node Huobi API)';
    const contentType = 'application/x-www-form-urlencoded';

    Huobi.subscriptions = {};
    Huobi.depthCache = {};
    Huobi.depthCacheContext = {};
    Huobi.ohlcLatest = {};
    Huobi.klineQueue = {};
    Huobi.ohlc = {};
    const default_options = {
        recvWindow: 5000,
        useServerTime: false,
        reconnect: true,
        verbose: false,
        test: false,
        log: function (...args) {
            console.log(Array.prototype.slice.call(args));
        }
    };
    Huobi.options = default_options;
    Huobi.info = { timeOffset: 0 };
    Huobi.socketHeartbeatInterval = null;
    /**
     * Replaces socks connection uri hostname with IP address
     * @param {string} connString - socks connection string
     * @return {string} modified string with ip address
     */
    const proxyReplacewithIp = function (connString) {
        return connString;
    }
    /**
     * Returns an array in the form of [host, port]
     * @param {string} connString - connection string
     * @return {array} array of host and port
     */
    const parseProxy = function (connString) {
        let arr = connString.split('/');
        let host = arr[2].split(':')[0];
        let port = arr[2].split(':')[1];
        return [arr[0], host, port];
    }
    /**
     * Checks to see of the object is iterable
     * @param {object} obj - The object check
     * @return {boolean} true or false is iterable
     */
    const isIterable = function (obj) {
        // checks for null and undefined
        if (obj === null) {
            return false;
        }
        return typeof obj[Symbol.iterator] === 'function';
    }
    const addProxy = opt => {
        let socksproxy = process.env.socks_proxy || false;
        if (socksproxy === false) return opt;
        socksproxy = proxyReplacewithIp(socksproxy);

        if (Huobi.options.verbose) Huobi.options.log('using socks proxy server ' + socksproxy);

        opt.agentClass = SocksProxyAgent;
        opt.agentOptions = {
            protocol: parseProxy(socksproxy)[0],
            host: parseProxy(socksproxy)[1],
            port: parseProxy(socksproxy)[2]
        }
        return opt;
    }
    const reqHandler = cb => (error, response, body) => {
        if (!cb) return;

        if (error) return cb(error, {});

        if (response && response.statusCode !== 200) return cb(response, {});

        return cb(null, JSON.parse(body));
    }

    const proxyRequest = (opt, cb) => request(addProxy(opt), reqHandler(cb));

    const reqObj = (url, data = {}, method = 'GET', key) => ({
        url: url,
        qs: data,
        method: method,
        timeout: Huobi.options.recvWindow,
        headers: {
            'User-Agent': userAgent,
            'Content-type': contentType,
            'X-MBX-APIKEY': key || ''
        }
    })
    const reqObjPOST = (url, data = {}, method = 'POST', key) => ({
        url: url,
        form: data,
        method: method,
        timeout: Huobi.options.recvWindow,
        headers: {
            'User-Agent': userAgent,
            'Content-type': contentType,
            'X-MBX-APIKEY': key || ''
        }
    })
    /**
     * Create a http request to the public API
     * @param {string} url - The http endpoint
     * @param {object} data - The data to send
     * @param {function} callback - The callback method to call
     * @param {string} method - the http method
     * @return {undefined}
     */
    const publicRequest = function (url, data = {}, callback, method = 'GET') {
        let opt = reqObj(url, data, method);
        proxyRequest(opt, callback);
    };

    /**
     * Create a http request to the public API
     * @param {string} url - The http endpoint
     * @param {object} data - The data to send
     * @param {function} callback - The callback method to call
     * @param {string} method - the http method
     * @return {undefined}
     */
    const apiRequest = function (url, data = {}, callback, method = 'GET') {
        // if (!Huobi.options.APIKEY) throw Error('apiRequest: Invalid API Key');
        let opt = reqObj(
            url,
            data,
            method,
            Huobi.options.APIKEY
        );
        proxyRequest(opt, callback);
    };

    /**
     * Used to subscribe to a single websocket endpoint
     * @param {string} endpoint - endpoint to connect to
     * @param {function} callback - the function to called when information is received
     * @param {boolean} reconnect - whether to reconnect on disconnect
     * @param {object} opened_callback - the function to called when opened
     * @return {WebSocket} - websocket reference
     */

    const subscribe = function (symbols, callback, reconnect = false, opened_callback = false) {

        let httpsproxy = process.env.https_proxy || false;
        let socksproxy = process.env.socks_proxy || false;
        let ws = false;

        if (socksproxy !== false) {
            socksproxy = proxyReplacewithIp(socksproxy);
            if (Huobi.options.verbose) Huobi.options.log('using socks proxy server ' + socksproxy);
            let agent = new SocksProxyAgent({
                protocol: parseProxy(socksproxy)[0],
                host: parseProxy(socksproxy)[1],
                port: parseProxy(socksproxy)[2]
            });
            //ws = new WebSocket(stream + endpoint, { agent: agent });
            ws = new WebSocket(stream , { agent: agent });
        } else if (httpsproxy !== false) {
            if (Huobi.options.verbose) Huobi.options.log('using proxy server ' + agent);
            let config = url.parse(httpsproxy);
            let agent = new HttpsProxyAgent(config);
            //ws = new WebSocket(stream + endpoint, { agent: agent });
            ws = new WebSocket(stream , { agent: agent });
        } else {
            //ws = new WebSocket(stream + endpoint);
            ws = new WebSocket(stream);
        }

        let doSymbolsToWebsocket = function () {
            if (Array.isArray(symbols)) {
                symbols.forEach(s => {
                    let channel = {};
                    channel.sub = "market." + s + ".depth.step0";
                    channel.id = new Date().getTime()+s;
                   // Huobi.options.log(channel.sub);
                    ws.send(JSON.stringify(channel));
                });
            } else {
                let channel = {};
                channel.sub = "market." + symbols + ".depth.step0";
                channel.id = new Date().getTime() + symbols;
                ws.send(JSON.stringify(channel));
            }


        };
        if (Huobi.options.verbose) Huobi.options.log('Subscribed to ' + stream);
        ws.reconnect = Huobi.options.reconnect;
        ws.endpoint = new Date().getTime()+"depth";
        ws.isAlive = false;
        ws.on('open', handleSocketOpen.bind(ws, opened_callback ? doSymbolsToWebsocket  : opened_callback));
        ws.on('pong', handleSocketHeartbeat);
        ws.on('error', handleSocketError);
        ws.on('close', handleSocketClose.bind(ws, reconnect));
        ws.on('message', function (data) {
            data = pako.inflate(data,{ to: 'string' });
            //Huobi.options.log('ws data: ' + data);
            try {
                let msg = JSON.parse(data);
                if (msg.ping) {
                    ws.send(JSON.stringify({ pong: msg.ping }));
                   // Huobi.options.log('ping: '+msg.ping  );
                } else if (msg.subbed) {
                    //Huobi.options.log('subbed: '+msg.id +" status: "+msg.status );
                     //options.log('subbed: '+msg.id +" status: "+msg.status );
                } else {
                    if (msg.status && msg.status == 'error') {
                        ws.send(JSON.stringify({ pong: msg.ping }));
                        // Huobi.options.log('ping: '+msg.ping  );
                        throw new Error(msg)
                    }
                    callback( JSON.parse(data) );
                }
            } catch (error) {
              //options.log('CombinedStream: Parse error: '+error.message +'-> '+ JSON.stringify(data) );
              Huobi.options.log('Parse error: ' + error.message);
            }
            // try {
            //     callback(JSON.parse(data));
            // } catch (error) {
            //     Huobi.options.log('Parse error: ' + error.message);
            // }
        });
        return ws;
    };

    /**
     * Make market request
     * @param {string} url - The http endpoint
     * @param {object} data - The data to send
     * @param {function} callback - The callback method to call
     * @param {string} method - the http method
     * @return {undefined}
     */
    const marketRequest = function (url, data = {}, callback, method = 'GET') {
        if (!Huobi.options.APIKEY) throw Error('apiRequest: Invalid API Key');
        let query = Object.keys(data).reduce(function (a, k) {
            a.push(k + '=' + encodeURIComponent(data[k]));
            return a;
        }, []).join('&');

        let opt = reqObj(
            url + (query ? '?' + query : ''),
            data,
            method,
            Huobi.options.APIKEY
        );
        proxyRequest(opt, callback);
    };

    const getSignature = function(url, data, query, method) {
        if (!Huobi.options.APIKEY) throw Error('apiRequest: Invalid API Key');
        if (!Huobi.options.APISECRET) throw Error('signedRequest: Invalid API Secret');
        //if (typeof data.recvWindow === 'undefined') data.recvWindow = Huobi.options.recvWindow;
        data.Timestamp = new Date().toISOString().replace(/\..+/, '');//.getTime()+ Huobi.info.timeOffset;
        data.SignatureMethod='HmacSHA256';
        data.SignatureVersion=2;
        data.AccessKeyId=Huobi.options.APIKEY;
        //console.log(data.Timestamp);

        let source = method + '\n' + site + '\n' + url.replace(base,'') + '\n' + query;
        let signature = crypto.createHmac('sha256', Huobi.options.APISECRET).update(source).digest('base64');//digest('hex'); // set the HMAC hash header
        signature = encodeURIComponent(signature);
        return signature;
    }
    /**
     * Create a signed http request to the signed API
     * @param {string} url - The http endpoint
     * @param {object} data - The data to send
     * @param {function} callback - The callback method to call
     * @param {string} method - the http method
     * @return {undefined}
     */
    const signedRequest = function (url, data = {}, callback, method = 'GET') {
        let query = Object.keys(data)
        .sort( (a,b)=> (a > b) ? 1 : -1 )
        .reduce(function (a, k) {
            a.push(k + '=' + encodeURIComponent(data[k]));
            return a;
        }, []).join('&');
        //console.log("query %s",query);
        const signature = getSignature(url, data, query, method);

        if (method === 'POST') {
            let opt = reqObjPOST(
                url + '?Signature=' + signature,
                data,
                method,
                Huobi.options.APIKEY
            );
            proxyRequest(opt, callback);
        } else {
            let opt = reqObj(
                url + '?' + query + '&Signature=' + signature,
                data,
                method,
                Huobi.options.APIKEY
            );
            proxyRequest(opt, callback);
        }
    };

    const parseSymbol = function (depth) {
        //Huobi.options.log("parseSymbol = ",depth)
        return depth.ch.split('.')[1];
    };

    /**
     * Used for /depth endpoint
     * @param {object} depth - information
     * @return {undefined}
     */
    const depthHandler = function (depth) {
        let symbol = parseSymbol(depth), obj;
        let context = Huobi.depthCacheContext[symbol];
        //Huobi.options.log(depth);
        //Huobi.options.log("context is" + (context != null));
        let updateDepthCache = function () {
            Huobi.depthCache[symbol].eventTime = depth.ts;
            for (obj of depth.tick.bids) { //bids
                Huobi.depthCache[symbol].bids[obj[0]] = parseFloat(obj[1]);
                if (obj[1] === '0.00000000') {
                    delete Huobi.depthCache[symbol].bids[obj[0]];
                }
            }
            for (obj of depth.tick.asks) { //asks
                Huobi.depthCache[symbol].asks[obj[0]] = parseFloat(obj[1]);
                if (obj[1] === '0.00000000') {
                    delete Huobi.depthCache[symbol].asks[obj[0]];
                }
            }
            context.skipCount = 0;
            context.lastEventUpdateId = depth.ts;
            context.lastEventUpdateTime = depth.ts;
        };

        // This is our first legal update from the stream data
        updateDepthCache();

    };
    /**
     * Create a signed http request to the signed API
     * @param {string} side - BUY or SELL
     * @param {string} symbol - The symbol to buy or sell
     * @param {string} quantity - The quantity to buy or sell
     * @param {string} price - The price per unit to transact each unit at
     * @param {object} flags - additional order settings
     * @param {function} callback - the callback function
     * @return {undefined}
     */
    const order = function (side, symbol, quantity, price, flags = {}, callback = false) {
        let endpoint = 'v3/order';
        if (Huobi.options.test) endpoint += '/test';
        let opt = {
            symbol: symbol,
            side: side,
            type: 'LIMIT',
            quantity: quantity
        };
        if (typeof flags.type !== 'undefined') opt.type = flags.type;
        if (opt.type.includes('LIMIT')) {
            opt.price = price;
            opt.timeInForce = 'GTC';
        }
        if (typeof flags.timeInForce !== 'undefined') opt.timeInForce = flags.timeInForce;
        if (typeof flags.newOrderRespType !== 'undefined') opt.newOrderRespType = flags.newOrderRespType;
        if (typeof flags.newClientOrderId !== 'undefined') opt.newClientOrderId = flags.newClientOrderId;

        /*
         * STOP_LOSS
         * STOP_LOSS_LIMIT
         * TAKE_PROFIT
         * TAKE_PROFIT_LIMIT
         * LIMIT_MAKER
         */
        if (typeof flags.icebergQty !== 'undefined') opt.icebergQty = flags.icebergQty;
        if (typeof flags.stopPrice !== 'undefined') {
            opt.stopPrice = flags.stopPrice;
            if (opt.type === 'LIMIT') throw Error('stopPrice: Must set "type" to one of the following: STOP_LOSS, STOP_LOSS_LIMIT, TAKE_PROFIT, TAKE_PROFIT_LIMIT');
        }
        signedRequest(base + endpoint, opt, function (error, response) {
            if (!response) {
                if (callback) callback(error, response);
                else Huobi.options.log('Order() error:', error);
                return;
            }
            if (typeof response.msg !== 'undefined' && response.msg === 'Filter failure: MIN_NOTIONAL') {
                Huobi.options.log('Order quantity too small. See exchangeInfo() for minimum amounts');
            }
            if (callback) callback(error, response);
            else Huobi.options.log(side + '(' + symbol + ',' + quantity + ',' + price + ') ', response);
        }, 'POST');
    };
    /**
     * No-operation function
     * @return {undefined}
     */
    const noop = function () {
        // do nothing
    };
    /**
     * Gets depth cache for given symbol
     * @param {string} symbol - the symbol to fetch
     * @return {object} - the depth cache object
     */
    const getDepthCache = function (symbol) {
        if (typeof Huobi.depthCache[symbol] === 'undefined') return { bids: {}, asks: {} };
        return Huobi.depthCache[symbol];
    };
    /**
     * Calculate Buy/Sell volume from DepthCache
     * @param {string} symbol - the symbol to fetch
     * @return {object} - the depth volume cache object
     */
    const depthVolume = function (symbol) {
        let cache = getDepthCache(symbol), quantity, price;
        let bidbase = 0, askbase = 0, bidqty = 0, askqty = 0;
        for (price in cache.bids) {
            quantity = cache.bids[price];
            bidbase += parseFloat((quantity * parseFloat(price)).toFixed(8));
            bidqty += quantity;
        }
        for (price in cache.asks) {
            quantity = cache.asks[price];
            askbase += parseFloat((quantity * parseFloat(price)).toFixed(8));
            askqty += quantity;
        }
        return { bids: bidbase, asks: askbase, bidQty: bidqty, askQty: askqty };
    };
    /**
     * Reworked Tuitio's heartbeat code into a shared single interval tick
     * @return {undefined}
     */
    const socketHeartbeat = function () {

        /* sockets removed from `subscriptions` during a manual terminate()
           will no longer be at risk of having functions called on them */
        for (let endpointId in Huobi.subscriptions) {
            const ws = Huobi.subscriptions[endpointId];
            if (ws.isAlive) {
                ws.isAlive = false;
                if (ws.readyState === WebSocket.OPEN) ws.ping(noop);
            } else {
                if (Huobi.options.verbose) Huobi.options.log('Terminating inactive/broken WebSocket: ' + ws.endpoint);
                if (ws.readyState === WebSocket.OPEN) ws.terminate();
            }
        }
    };

    /**
     * Called when socket is opened, subscriptions are registered for later reference
     * @param {function} opened_callback - a callback function
     * @return {undefined}
     */
    const handleSocketOpen = function (opened_callback) {
        this.isAlive = true;
        if (Object.keys(Huobi.subscriptions).length === 0) {
            Huobi.socketHeartbeatInterval = setInterval(socketHeartbeat, 30000);
        }
        Huobi.subscriptions[this.endpoint] = this;
        // console.log('ENDPOINT', this.endpoint);
        // console.log('OPENED', JSON.stringify(opened_callback));
        if (typeof opened_callback === 'function') opened_callback(this.endpoint);
    };

    /**
     * Called when socket is closed, subscriptions are de-registered for later reference
     * @param {boolean} reconnect - true or false to reconnect the socket
     * @param {string} code - code associated with the socket
     * @param {string} reason - string with the response
     * @return {undefined}
     */
    const handleSocketClose = function (reconnect, code, reason) {
        delete Huobi.subscriptions[this.endpoint];
        if (Huobi.subscriptions && Object.keys(Huobi.subscriptions).length === 0) {
            clearInterval(Huobi.socketHeartbeatInterval);
        }
        Huobi.options.log('WebSocket closed: ' + (this.endpoint || '') +
            (code ? ' (' + code + ')' : '') +
            (reason ? ' ' + reason : ''));
        if (Huobi.options.reconnect && this.reconnect && reconnect) {
            if (this.endpoint && parseInt(this.endpoint.length, 10) === 60)
                Huobi.options.log('Account data WebSocket reconnecting...');
            else
                Huobi.options.log('WebSocket reconnecting: ' + (this.endpoint || '') + '...');
            try {
                setTimeout(() => {
                    reconnect();
                }, 5000);
            } catch (error) {
                Huobi.options.log('WebSocket reconnect error: ' + error.message);
            }
        }
    };

    /**
     * Used by balance to get the balance data
     * @param {array} data - account info object
     * @return {object} - balances hel with available, onorder amounts
     */
    const balanceData = function (data) {
        let balances = {};
        if (typeof data === 'undefined') return {};
        if (typeof data.data === 'undefined') {
            Huobi.options.log('balanceData error', data);
            return {};
        }

        for (let obj of data.data.list) {
            //balances[obj.asset] = { available: obj.free, onOrder: obj.locked };
            if (balances[obj.currency]  ==  null){
                balances[obj.currency] = {};
            }
            if(obj.type === 'trade'){
                balances[obj.currency].available = obj.balance;
            }else if(obj.type === 'frozen'){
                balances[obj.currency].frozen = obj.balance;
            }
        }

        return balances;
    };

    /**
     * Called when socket errors
     * @param {object} error - error object message
     * @return {undefined}
     */
    const handleSocketError = function (error) {
        /* Errors ultimately result in a `close` event.
           see: https://github.com/websockets/ws/blob/828194044bf247af852b31c49e2800d557fedeff/lib/websocket.js#L126 */
        Huobi.options.log('WebSocket error: ' + (this.endpoint || '') +
            (error.code ? ' (' + error.code + ')' : '') +
            (error.message ? ' ' + error.message : ''));
    };

    /**
     * Called on each socket heartbeat
     * @return {undefined}
     */
    const handleSocketHeartbeat = function () {
        this.isAlive = true;
    };

    /**
     * Used to terminate a web socket
     * @param {string} endpoint - endpoint identifier associated with the web socket
     * @param {boolean} reconnect - auto reconnect after termination
     * @return {undefined}
     */
    const terminate = function (endpoint, reconnect = false) {
        let ws = Huobi.subscriptions[endpoint];
        if (!ws) return;
        ws.removeAllListeners('message');
        ws.reconnect = reconnect;
        ws.terminate();
    }


    /**
     * Checks whether or not an array contains any duplicate elements
     *  Note(keith1024): at the moment this only works for primitive types,
     *  will require modification to work with objects
     * @param {array} array - the array to check
     * @return {boolean} - true or false
     */
    const isArrayUnique = function (array) {
        let s = new Set(array);
        return s.size === array.length;
    };
    return {
        /**
         * Gets depth cache for given symbol
         * @param {symbol} symbol - get depch cache for this symbol
         * @return {object} - object
         */
        depthCache: function (symbol) {
            return getDepthCache(symbol);
        },

        /**
         * Gets depth volume for given symbol
         * @param {symbol} symbol - get depch volume for this symbol
         * @return {object} - object
         */
        depthVolume: function (symbol) {
            return depthVolume(symbol);
        },
        //
        // /**
        //  * Count decimal places
        //  * @param {float} float - get the price precision point
        //  * @return {int} - number of place
        //  */
        // getPrecision: function (float) {
        //     if ( !float || Number.isInteger( float ) ) return 0;
        //     return float.toString().split('.')[1].length || 0;
        // },
        //
        // /**
        //  * rounds number with given step
        //  * @param {float} qty - quantity to round
        //  * @param {float} stepSize - stepSize as specified by exchangeInfo
        //  * @return {float} - number
        //  */
        // roundStep: function (qty, stepSize) {
        //     // Integers do not require rounding
        //     if (Number.isInteger(qty)) return qty;
        //     const qtyString = qty.toFixed(16);
        //     const desiredDecimals = Math.max(stepSize.indexOf('1') - 1, 0);
        //     const decimalIndex = qtyString.indexOf('.');
        //     return parseFloat(qtyString.slice(0, decimalIndex + desiredDecimals + 1));
        // },
        //
        // /**
        //  * rounds price to required precision
        //  * @param {float} price - price to round
        //  * @param {float} tickSize - tickSize as specified by exchangeInfo
        //  * @return {float} - number
        //  */
        // roundTicks: function (price, tickSize) {
        //     const formatter = new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 8 });
        //     const precision = formatter.format(tickSize).split('.')[1].length || 0;
        //     if (typeof price === 'string') price = parseFloat(price);
        //     return price.toFixed(precision);
        // },
        //
        // /**
        //  * Gets percentage of given numbers
        //  * @param {float} min - the smaller number
        //  * @param {float} max - the bigger number
        //  * @param {int} width - percentage width
        //  * @return {float} - percentage
        //  */
        // percent: function (min, max, width = 100) {
        //     return (min * 0.01) / (max * 0.01) * width;
        // },
        //
        // /**
        //  * Gets the sum of an array of numbers
        //  * @param {array} array - the number to add
        //  * @return {float} - sum
        //  */
        // sum: function (array) {
        //     return array.reduce((a, b) => a + b, 0);
        // },
        //
        // /**
        //  * Reverses the keys of an object
        //  * @param {object} object - the object
        //  * @return {object} - the object
        //  */
        // reverse: function (object) {
        //     let range = Object.keys(object).reverse(), output = {};
        //     for (let price of range) {
        //         output[price] = object[price];
        //     }
        //     return output;
        // },
        //
        // /**
        //  * Converts an object to an array
        //  * @param {object} obj - the object
        //  * @return {array} - the array
        //  */
        // array: function (obj) {
        //     return Object.keys(obj).map(function (key) {
        //         return [Number(key), obj[key]];
        //     });
        // },
        //
        /**
         * Sorts bids
         * @param {string} symbol - the object
         * @param {int} max - the max number of bids
         * @param {string} baseValue - the object
         * @return {object} - the object
         */
        sortBids: function (symbol, max = Infinity, baseValue = false) {
            let object = {}, count = 0, cache;
            if (typeof symbol === 'object') cache = symbol;
            else cache = getDepthCache(symbol).bids;
            let sorted = Object.keys(cache).sort(function (a, b) {
                return parseFloat(b) - parseFloat(a)
            });
            let cumulative = 0;
            for (let price of sorted) {
                if (baseValue === 'cumulative') {
                    cumulative += parseFloat(cache[price]);
                    object[price] = cumulative;
                } else if (!baseValue) object[price] = parseFloat(cache[price]);
                else object[price] = parseFloat((cache[price] * parseFloat(price)).toFixed(8));
                if (++count >= max) break;
            }
            return object;
        },

        /**
         * Sorts asks
         * @param {string} symbol - the object
         * @param {int} max - the max number of bids
         * @param {string} baseValue - the object
         * @return {object} - the object
         */
        sortAsks: function (symbol, max = Infinity, baseValue = false) {
            let object = {}, count = 0, cache;
            if (typeof symbol === 'object') cache = symbol;
            else cache = getDepthCache(symbol).asks;
            let sorted = Object.keys(cache).sort(function (a, b) {
                return parseFloat(a) - parseFloat(b);
            });
            let cumulative = 0;
            for (let price of sorted) {
                if (baseValue === 'cumulative') {
                    cumulative += parseFloat(cache[price]);
                    object[price] = cumulative;
                } else if (!baseValue) object[price] = parseFloat(cache[price]);
                else object[price] = parseFloat((cache[price] * parseFloat(price)).toFixed(8));
                if (++count >= max) break;
            }
            return object;
        },
        //
        // /**
        //  * Returns the first property of an object
        //  * @param {object} object - the object to get the first member
        //  * @return {string} - the object key
        //  */
        // first: function (object) {
        //     return Object.keys(object).shift();
        // },
        //
        // /**
        //  * Returns the last property of an object
        //  * @param {object} object - the object to get the first member
        //  * @return {string} - the object key
        //  */
        // last: function (object) {
        //     return Object.keys(object).pop();
        // },
        //
        // /**
        //  * Returns an array of properties starting at start
        //  * @param {object} object - the object to get the properties form
        //  * @param {int} start - the starting index
        //  * @return {array} - the array of entires
        //  */
        // slice: function (object, start = 0) {
        //     return Object.entries(object).slice(start).map(entry => entry[0]);
        // },
        //
        // /**
        //  * Gets the minimum key form object
        //  * @param {object} object - the object to get the properties form
        //  * @return {string} - the minimum key
        //  */
        // min: function (object) {
        //     return Math.min.apply(Math, Object.keys(object));
        // },
        //
        // /**
        //  * Gets the maximum key form object
        //  * @param {object} object - the object to get the properties form
        //  * @return {string} - the minimum key
        //  */
        // max: function (object) {
        //     return Math.max.apply(Math, Object.keys(object));
        // },
        //
        // /**
        //  * Sets an option given a key and value
        //  * @param {string} key - the key to set
        //  * @param {object} value - the value of the key
        //  * @return {undefined}
        //  */
        // setOption: function (key, value) {
        //     Binance.options[key] = value;
        // },
        //
        // /**
        //  * Gets an option given a key
        //  * @param {string} key - the key to set
        //  * @return {undefined}
        //  */
        // getOption: function (key) {
        //     return Binance.options[key];
        // },
        //
        // /**
        //  * Returns the entire info object
        //  * @return {object} - the info object
        //  */
        // getInfo: function () {
        //     return Binance.info;
        // },

        /**
         * Returns the entire options object
         * @return {object} - the options object
         */
        getOptions: function () {
            return Binance.options;
        },

        /**
         * Gets an option given a key
         * @param {object} opt - the object with the class configuration
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        options: function (opt, callback = false) {
            if (typeof opt === 'string') { // Pass json config filename
                Huobi.options = JSON.parse(file.readFileSync(opt));
            } else Huobi.options = opt;
            if (typeof Huobi.options.recvWindow === 'undefined') Huobi.options.recvWindow = default_options.recvWindow;
            if (typeof Huobi.options.useServerTime === 'undefined') Huobi.options.useServerTime = default_options.useServerTime;
            if (typeof Huobi.options.reconnect === 'undefined') Huobi.options.reconnect = default_options.reconnect;
            if (typeof Huobi.options.test === 'undefined') Huobi.options.test = default_options.test;
            if (typeof Huobi.options.log === 'undefined') Huobi.options.log = default_options.log;
            if (typeof Huobi.options.verbose === 'undefined') Huobi.options.verbose = default_options.verbose;
            if (Huobi.options.useServerTime) {
                apiRequest(base + 'v1/time', {}, function (error, response) {
                    Huobi.info.timeOffset = response.serverTime - new Date().getTime();
                    //Binance.options.log("server time set: ", response.serverTime, Binance.info.timeOffset);
                    if (callback) callback();
                });
            } else if (callback) callback();
            return this;
        },


        /**
         * Creates an order
         * @param {string} side - BUY or SELL
         * @param {string} symbol - the symbol to buy
         * @param {numeric} quantity - the quantity required
         * @param {numeric} price - the price to pay for each unit
         * @param {object} flags - aadditionalbuy order flags
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        order: function (side, symbol, quantity, price, flags = {}, callback = false) {
            order(side, symbol, quantity, price, flags, callback);
        },

        /**
         * Creates a buy order
         * @param {string} symbol - the symbol to buy
         * @param {numeric} quantity - the quantity required
         * @param {numeric} price - the price to pay for each unit
         * @param {object} flags - additional buy order flags
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        buy: function (symbol, quantity, price, flags = {}, callback = false) {
            order('BUY', symbol, quantity, price, flags, callback);
        },

        /**
         * Creates a sell order
         * @param {string} symbol - the symbol to sell
         * @param {numeric} quantity - the quantity required
         * @param {numeric} price - the price to sell each unit for
         * @param {object} flags - additional order flags
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        sell: function (symbol, quantity, price, flags = {}, callback = false) {
            order('SELL', symbol, quantity, price, flags, callback);
        },

        /**
         * Creates a market buy order
         * @param {string} symbol - the symbol to buy
         * @param {numeric} quantity - the quantity required
         * @param {object} flags - additional buy order flags
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        marketBuy: function (symbol, quantity, flags = { type: 'MARKET' }, callback = false) {
            if (typeof flags === 'function') { // Accept callback as third parameter
                callback = flags;
                flags = { type: 'MARKET' };
            }
            if (typeof flags.type === 'undefined') flags.type = 'MARKET';
            order('BUY', symbol, quantity, 0, flags, callback);
        },

        /**
         * Creates a market sell order
         * @param {string} symbol - the symbol to sell
         * @param {numeric} quantity - the quantity required
         * @param {object} flags - additional sell order flags
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        marketSell: function (symbol, quantity, flags = { type: 'MARKET' }, callback = false) {
            if (typeof flags === 'function') { // Accept callback as third parameter
                callback = flags;
                flags = { type: 'MARKET' };
            }
            if (typeof flags.type === 'undefined') flags.type = 'MARKET';
            order('SELL', symbol, quantity, 0, flags, callback);
        },

        /**
         * Cancels an order
         * @param {string} symbol - the symbol to cancel
         * @param {string} orderid - the orderid to cancel
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        cancel: function (symbol, orderid, callback = false) {
            signedRequest(base + 'v3/order', { symbol: symbol, orderId: orderid }, function (error, data) {
                if (callback) return callback.call(this, error, data, symbol);
            }, 'DELETE');
        },

        /**
         * Gets the status of an order
         * @param {string} symbol - the symbol to check
         * @param {string} orderid - the orderid to check
         * @param {function} callback - the callback function
         * @param {object} flags - any additional flags
         * @return {undefined}
         */
        orderStatus: function (symbol, orderid, callback, flags = {}) {
            let parameters = Object.assign({ symbol: symbol, orderId: orderid }, flags);
            signedRequest(base + 'v3/order', parameters, function (error, data) {
                if (callback) return callback.call(this, error, data, symbol);
            });
        },

        /**
         * Gets open orders
         * @param {string} symbol - the symbol to get
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        openOrders: function (symbol, callback) {
            let parameters = symbol ? { symbol: symbol } : {};
            signedRequest(base + 'v3/openOrders', parameters, function (error, data) {
                return callback.call(this, error, data, symbol);
            });
        },

        /**
         * Cancels all order of a given symbol
         * @param {string} symbol - the symbol to cancel all orders for
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        cancelOrders: function (symbol, callback = false) {
            signedRequest(base + 'v3/openOrders', { symbol: symbol }, function (error, json) {
                if (json.length === 0) {
                    if (callback) return callback.call(this, 'No orders present for this symbol', {}, symbol);
                }
                for (let obj of json) {
                    let quantity = obj.origQty - obj.executedQty;
                    Binance.options.log('cancel order: ' + obj.side + ' ' + symbol + ' ' + quantity + ' @ ' + obj.price + ' #' + obj.orderId);
                    signedRequest(base + 'v3/order', { symbol: symbol, orderId: obj.orderId }, function (error, data) {
                        if (callback) return callback.call(this, error, data, symbol);
                    }, 'DELETE');
                }
            });
        },

        /**
         * Gets all order of a given symbol
         * @param {string} symbol - the symbol
         * @param {function} callback - the callback function
         * @param {object} options - additional options
         * @return {undefined}
         */
        allOrders: function (symbol, callback, options = {}) {
            let parameters = Object.assign({ symbol: symbol }, options);
            signedRequest(base + 'v3/allOrders', parameters, function (error, data) {
                if (callback) return callback.call(this, error, data, symbol);
            });
        },

        /**
         * Gets the depth information for a given symbol
         * @param {string} symbol - the symbol
         * @param {function} callback - the callback function
         * @param {int} limit - limit the number of returned orders
         * @return {undefined}
         */
        depth: function (symbol, callback, limit = 100) {
            publicRequest(base + 'v1/depth', { symbol: symbol, limit: limit }, function (error, data) {
                return callback.call(this, error, depthData(data), symbol);
            });
        },

        /**
         * Gets the average prices of a given symbol
         * @param {string} symbol - the symbol
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        avgPrice: function (symbol, callback = false) {
            let socksproxy = process.env.socks_proxy || false;

            let opt = {
                url: base + 'v3/avgPrice?symbol=' + symbol,
                timeout: Binance.options.recvWindow
            };

            if (socksproxy !== false) {
                socksproxy = proxyReplacewithIp(socksproxy);
                if (Binance.options.verbose) Binance.options.log('using socks proxy server ' + socksproxy);
                opt.agentClass = SocksProxyAgent;
                opt.agentOptions = {
                    protocol: parseProxy(socksproxy)[0],
                    host: parseProxy(socksproxy)[1],
                    port: parseProxy(socksproxy)[2]
                }
            }

            request(opt, function (error, response, body) {
                if (!callback) return;

                if (error) return callback(error);

                if (response && response.statusCode !== 200) return callback(response);

                if (callback) return callback(null, priceData(JSON.parse(body)));
            });
        },

        /**
         * Gets the prices of a given symbol(s)
         * @param {string} symbol - the symbol
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        prices: function (symbol, callback = false) {
            const params = typeof symbol === 'string' ? '?symbol=' + symbol : '';
            if (typeof symbol === 'function') callback = symbol; // backwards compatibility

            let socksproxy = process.env.socks_proxy || false;

            let opt = {
                url: base + 'v3/ticker/price' + params,
                timeout: Binance.options.recvWindow
            };

            if (socksproxy !== false) {
                socksproxy = proxyReplacewithIp(socksproxy);
                if (Binance.options.verbose) Binance.options.log('using socks proxy server ' + socksproxy);
                opt.agentClass = SocksProxyAgent;
                opt.agentOptions = {
                    protocol: parseProxy(socksproxy)[0],
                    host: parseProxy(socksproxy)[1],
                    port: parseProxy(socksproxy)[2]
                }
            }

            request(opt, function (error, response, body) {
                if (!callback) return;

                if (error) return callback(error);

                if (response && response.statusCode !== 200) return callback(response);

                if (callback) return callback(null, priceData(JSON.parse(body)));
            });
        },

        /**
         * Gets the book tickers of given symbol(s)
         * @param {string} symbol - the symbol
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        bookTickers: function (symbol, callback) {
            const params = typeof symbol === 'string' ? '?symbol=' + symbol : '';
            if (typeof symbol === 'function') callback = symbol; // backwards compatibility

            let socksproxy = process.env.socks_proxy || false;

            let opt = {
                url: base + 'v3/ticker/bookTicker' + params,
                timeout: Binance.options.recvWindow
            };

            if (socksproxy !== false) {
                socksproxy = proxyReplacewithIp(socksproxy);
                if (Binance.options.verbose) Binance.options.log('using socks proxy server ' + socksproxy);
                opt.agentClass = SocksProxyAgent;
                opt.agentOptions = {
                    protocol: parseProxy(socksproxy)[0],
                    host: parseProxy(socksproxy)[1],
                    port: parseProxy(socksproxy)[2]
                }
            }

            request(opt, function (error, response, body) {
                if (!callback) return;

                if (error) return callback(error);

                if (response && response.statusCode !== 200) return callback(response);

                if (callback) {
                    const result = symbol ? JSON.parse(body) : bookPriceData(JSON.parse(body));
                    return callback(null, result);
                }
            });
        },

        /**
         * Gets the prevday percentage change
         * @param {string} symbol - the symbol or symbols
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        prevDay: function (symbol, callback) {
            let input = symbol ? { symbol: symbol } : {};
            publicRequest(base + 'v1/ticker/24hr', input, function (error, data) {
                if (callback) return callback.call(this, error, data, symbol);
            });
        },

        /**
         * Gets the the exchange info
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        exchangeInfo: function (callback) {
            publicRequest(base + '/v1/common/symbols', {}, callback);
        },
        /**
         * Gets the dust log for user
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        dustLog: function (callback) {
            signedRequest(wapi + '/v3/userAssetDribbletLog.html', {}, callback);
        },
        /**
         * Gets the the system status
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        systemStatus: function (callback) {
            publicRequest(wapi + 'v3/systemStatus.html', {}, callback);
        },

        /**
         * Withdraws asset to given wallet id
         * @param {string} asset - the asset symbol
         * @param {string} address - the wallet to transfer it to
         * @param {number} amount - the amount to transfer
         * @param {string} addressTag - and addtional address tag
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        withdraw: function (asset, address, amount, addressTag = false, callback = false) {
            let params = { asset, address, amount };
            params.name = 'API Withdraw';
            if (addressTag) params.addressTag = addressTag;
            signedRequest(wapi + 'v3/withdraw.html', params, callback, 'POST');
        },

        /**
         * Get the Withdraws history for a given asset
         * @param {function} callback - the callback function
         * @param {object} params - supports limit and fromId parameters
         * @return {undefined}
         */
        withdrawHistory: function (callback, params = {}) {
            if (typeof params === 'string') params = { asset: params };
            signedRequest(wapi + 'v3/withdrawHistory.html', params, callback);
        },

        /**
         * Get the deposit history
         * @param {function} callback - the callback function
         * @param {object} params - additional params
         * @return {undefined}
         */
        depositHistory: function (callback, params = {}) {
            if (typeof params === 'string') params = { asset: params }; // Support 'asset' (string) or optional parameters (object)
            signedRequest(wapi + 'v3/depositHistory.html', params, callback);
        },

        /**
         * Get the deposit history for given asset
         * @param {string} asset - the asset
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        depositAddress: function (asset, callback) {
            signedRequest(wapi + 'v3/depositAddress.html', { asset: asset }, callback);
        },

        /**
         * Get the account status
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        accountStatus: function (callback) {
            signedRequest(wapi + 'v3/accountStatus.html', {}, callback);
        },

        /**
         * Get the trade fee
         * @param {function} callback - the callback function
         * @param {string} symbol (optional)
         * @return {undefined}
         */
        tradeFee: function (callback, symbol = false) {
            let params = symbol ? { symbol: symbol } : {};
            signedRequest(wapi + 'v3/tradeFee.html', params, callback);
        },

        /**
         * Fetch asset detail (minWithdrawAmount, depositStatus, withdrawFee, withdrawStatus, depositTip)
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        assetDetail: function (callback) {
            signedRequest(wapi + 'v3/assetDetail.html', {}, callback);
        },

        /**
         * Get the account
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        account: function (callback) {
            signedRequest(base + '/v1/account/accounts', {}, callback);
        },

        /**
         * Get the balance data
         * @param {string} accountId - the account
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        balance: function (accountId,callback) {
            signedRequest(base + '/v1/account/accounts/'+accountId+'/balance', {}, function (error, data) {
                if (callback) callback(error, balanceData(data));
            });
        },

        /**
         * Get trades for a given symbol
         * @param {string} symbol - the symbol
         * @param {function} callback - the callback function
         * @param {object} options - additional options
         * @return {undefined}
         */
        trades: function (symbol, callback, options = {}) {
            let parameters = Object.assign({ symbol: symbol }, options);
            signedRequest(base + 'v3/myTrades', parameters, function (error, data) {
                if (callback) return callback.call(this, error, data, symbol);
            });
        },

        /**
         * Tell api to use the server time to offset time indexes
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        useServerTime: function (callback = false) {
            apiRequest(base + 'v1/time', {}, function (error, response) {
                Huobi.info.timeOffset = response.serverTime - new Date().getTime();
                //Binance.options.log("server time set: ", response.serverTime, Binance.info.timeOffset);
                if (callback) callback();
            });
        },

        /**
         * Gets the time
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        time: function (callback) {
            apiRequest(base + '/v1/common/timestamp', {}, callback);
        },

        /**
         * Get agg trades for given symbol
         * @param {string} symbol - the symbol
         * @param {object} options - addtional optoins
         * @param {function} callback - the callback function
         * @return {undefined}
         */
        aggTrades: function (symbol, options = {}, callback = false) { //fromId startTime endTime limit
            let parameters = Object.assign({ symbol }, options);
            marketRequest(base + 'v1/aggTrades', parameters, callback);
        },

        /**
         * Get the recent trades
         * @param {string} symbol - the symbol
         * @param {function} callback - the callback function
         * @param {int} limit - limit the number of items returned
         * @return {undefined}
         */
        recentTrades: function (symbol, callback, limit = 500) {
            marketRequest(base + 'v1/trades', { symbol: symbol, limit: limit }, callback);
        },

        /**
         * Get the historical trade info
         * @param {string} symbol - the symbol
         * @param {function} callback - the callback function
         * @param {int} limit - limit the number of items returned
         * @param {int} fromId - from this id
         * @return {undefined}
         */
        historicalTrades: function (symbol, callback, limit = 500, fromId = false) {
            let parameters = { symbol: symbol, limit: limit };
            if (fromId) parameters.fromId = fromId;
            marketRequest(base + 'v1/historicalTrades', parameters, callback);
        },

        /**
         * Convert chart data to highstock array [timestamp,open,high,low,close]
         * @param {object} chart - the chart
         * @param {boolean} include_volume - to include the volume or not
         * @return {array} - an array
         */
        highstock: function (chart, include_volume = false) {
            let array = [];
            for (let timestamp in chart) {
                let obj = chart[timestamp];
                let line = [
                    Number(timestamp),
                    parseFloat(obj.open),
                    parseFloat(obj.high),
                    parseFloat(obj.low),
                    parseFloat(obj.close)
                ];
                if (include_volume) line.push(parseFloat(obj.volume));
                array.push(line);
            }
            return array;
        },

        /**
         * Populates hte OHLC information
         * @param {object} chart - the chart
         * @return {object} - object with candle information
         */
        ohlc: function (chart) {
            let open = [], high = [], low = [], close = [], volume = [];
            for (let timestamp in chart) { //Binance.ohlc[symbol][interval]
                let obj = chart[timestamp];
                open.push(parseFloat(obj.open));
                high.push(parseFloat(obj.high));
                low.push(parseFloat(obj.low));
                close.push(parseFloat(obj.close));
                volume.push(parseFloat(obj.volume));
            }
            return { open: open, high: high, low: low, close: close, volume: volume };
        },

        /**
         * Gets the candles information for a given symbol
         * intervals: 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M
         * @param {string} symbol - the symbol
         * @param {function} interval - the callback function
         * @param {function} callback - the callback function
         * @param {object} options - additional options
         * @return {undefined}
         */
        candlesticks: function (symbol, interval = '5m', callback = false, options = { limit: 500 }) {
            if (!callback) return;
            let params = Object.assign({ symbol: symbol, interval: interval }, options);
            publicRequest(base + 'v1/klines', params, function (error, data) {
                return callback.call(this, error, data, symbol);
            });
        },

        /**
         * Queries the public api
         * @param {string} url - the public api endpoint
         * @param {object} data - the data to send
         * @param {function} callback - the callback function
         * @param {string} method - the http method
         * @return {undefined}
         */
        publicRequest: function (url, data, callback, method = 'GET') {
            publicRequest(url, data, callback, method)
        },

        /**
         * Queries the signed api
         * @param {string} url - the signed api endpoint
         * @param {object} data - the data to send
         * @param {function} callback - the callback function
         * @param {string} method - the http method
         * @return {undefined}
         */
        signedRequest: function (url, data, callback, method = 'GET') {
            signedRequest(url, data, callback, method);
        },

        /**
         * Gets the market asset of given symbol
         * @param {string} symbol - the public api endpoint
         * @return {undefined}
         */
        getMarket: function (symbol) {
            const substring = symbol.substr(-3);
            if (substring === 'BTC') return 'BTC';
            else if (substring === 'ETH') return 'ETH';
            else if (substring === 'BNB') return 'BNB';
            else if (symbol.substr(-4) === 'USDT') return 'USDT';
        },
        websockets: {
            // ws: null,
            connect: function(reconnect = false, opened_callback = false, endpoint = stream) {
                console.log(`Connecting to ${endpoint}...`);
                let httpsproxy = process.env.https_proxy || false;
                let socksproxy = process.env.socks_proxy || false;
                // let ws = false;
                let agent;
                if (socksproxy !== false) {
                    socksproxy = proxyReplacewithIp(socksproxy);
                    if (Huobi.options.verbose) Huobi.options.log('using socks proxy server ' + socksproxy);
                    agent = new SocksProxyAgent({
                        protocol: parseProxy(socksproxy)[0],
                        host: parseProxy(socksproxy)[1],
                        port: parseProxy(socksproxy)[2]
                    });
                } else if (httpsproxy !== false) {
                    if (Huobi.options.verbose) Huobi.options.log('using proxy server ' + agent);
                    let config = url.parse(httpsproxy);
                    agent = new HttpsProxyAgent(config);
                } else {
                }
                // ws = new WebSocketAsPromised(stream, {
                //     createWebSocket: url => agent ? new WebSocket(url, {agent}) : new WebSocket(url),
                //     extractMessageData: event => event, // <- this is important
                // });
                ws = agent ? new WebSocket(endpoint, {agent}) : new WebSocket(endpoint);
                ws.endpoint = endpoint;
                ws.reconnect = Huobi.options.reconnect ?
                reconnect :
                () => {console.log('Not reconnecting')};
                ws.isAlive = false;
                // console.log('OPENED_CALLBACK', JSON.stringify(opened_callback));
                ws.on('open', handleSocketOpen.bind(ws, opened_callback || (() => {console.log('Connected')} ) ));
                ws.on('pong', handleSocketHeartbeat);
                ws.on('error', handleSocketError);
                ws.on('close', handleSocketClose.bind(ws, ws.reconnect));
                return ws;
            },
            subscribeV1: (ws, topic) => {
                try {
                    ws.send(JSON.stringify({op: 'sub', cid: '', topic}));
                    console.log('Subscribed to: ', topic);
                } catch (error) {
                    console.error(error);
                }
            },
            subscribeV2: (ws, topic, options) => {
                try {
                    const req = Object.assign({sub: topic, id: ''}, options);
                    ws.send(JSON.stringify(req));
                } catch (error) {
                    console.error(error);
                }
            },
            subscribeKline: (ws, ch, options) => {
                try {
                    const req = Object.assign({req: ch}, options);
                    ws.send(JSON.stringify(req));
                } catch (error) {
                    console.error(error);
                }
            },
            onV1Message: (ws, callback) => {
                ws.on('message', function (data) {
                    data = pako.inflate(data,{ to: 'string' });
                    // Huobi.options.log('ws data: ' + data);
                    try {
                        let msg = JSON.parse(data);
                        if (msg.ping) {
                            ws.send(JSON.stringify({ pong: msg.ping }));
                            // Huobi.options.log('ping: ' + msg.ping);
                        } else if (msg.subbed) {
                            Huobi.options.log('subbed: ' + msg.subbed + " status: " + msg.status);
                        } else {
                            if (msg.status && msg.status == 'error') {
                                ws.send(JSON.stringify({ pong: msg.ping }));
                                Huobi.options.log('ping: '+msg.ping  );
                                throw new Error(msg)
                            }
                            callback( JSON.parse(data) );
                        }
                    } catch (error) {
                        //options.log('CombinedStream: Parse error: '+error.message +'-> '+ JSON.stringify(data) );
                        Huobi.options.log('Parse error: ' + error.message);
                    }
                });
            },

            onV2Message: (ws, callback, topics) => {
                const authSubscribe = (topics) => {
                    topics.forEach(topic => {
                        ws.send(JSON.stringify({
                            action: 'sub',
                            ch: topic,
                        }));

                    });
                };
                ws.on('message', function (data) {
                    try {
                        let msg = JSON.parse(data);
                        if (msg.action === 'ping') {
                            ws.send(JSON.stringify({
                                action: 'pong',
                                data: {
                                    ts: msg.data.ts,
                                }
                            }));
                            // Huobi.options.log('ping: ' + msg.ping);
                        } else if (msg.ch === 'auth' && msg.code === 200) {
                            console.log('Websocket authenticated!');
                            this.subscribeV2(ws, topics);
                        } else if (msg.action === 'sub') {
                            Huobi.options.log('Huobi: Subscribed to ' + msg.ch);
                            // options.log('subbed: '+msg.id +" status: "+msg.status );
                        } else {
                            // if (msg.status && msg.status == 'error') {
                            //     ws.send(JSON.stringify({ pong: msg.ping }));
                            //     Huobi.options.log('ping: '+msg.ping  );
                            //     throw new Error(msg)
                            // }
                            callback( JSON.parse(data) );
                        }
                    } catch (error) {
                        //options.log('CombinedStream: Parse error: '+error.message +'-> '+ JSON.stringify(data) );
                        Huobi.options.log('Parse error: ' + error.message);
                    }
                });
            },
            market: function (topics, callback) {
                const endpoint = stream;
                const ws = this.connect(() => this.market(topics, callback), () => {
                    console.log(`Connected!`);
                    this.onV1Message(ws, callback);
                    topics.forEach(topic => {
                        this.subscribeV2(ws, topic);
                    });
                    return ws;
                }, endpoint);
                return ws;
            },
            kline: function (topics, callback, options) {
                const endpoint = stream;
                const ws = this.connect(() => this.kline(topics, callback, options), () => {
                    console.log(`Connected!`);
                    this.onV1Message(ws, callback);
                    topics.forEach(topic => {
                        this.subscribeKline(ws, topic, options);
                    });
                    return ws;
                }, endpoint);
                return ws;
            },
            // futures: function () {
            //     const ws = this.connect(true, (endpoint) => {
            //         this.onMessage(ws, callback);
            //         topics.forEach(topic => {
            //             this.subscribe(ws, topic);
            //         });
            //         return ws;
            //     });
            //     return ws;
            // },
            userV1: function(topics, callback, endpoint) {
                const versionStr = '/ws/v1';

                const ws = this.connect(() => this.userV1(topics, callback, endpoint), () => {
                    console.log(`Connected!`);
                    // authenticate
                    let {params, signature} = this.getSignature(site, '/notification', '2');
                    const req = Object.assign({
                        op: 'auth',
                        type: 'api',
                    }, params, {Signature: signature});
                    // console.log('Websocket Signature Request', JSON.stringify(req, null, 2));
                    ws.send(JSON.stringify(req));
                    // ws.on('message', console.log);
                    this.onV1Message(ws, callback, topics);
                    // setTimeout(() => {
                    // }, 500);
                    return ws;
                }, endpoint);
                return ws;
            },
            userV2: function(topics, callback, endpoint) {
                const versionStr = '/ws/v2';

                const ws = this.connect(() => this.userV2(topics, callback, endpoint), () => {
                    console.log(`Connected!`);
                    // authenticate
                    let {params, signature} = this.getSignature(site, versionStr, '2.1');
                    const req = {
                        action: 'req',
                        ch: 'auth',
                        params: {
                            authType: 'api',
                            ...params,
                            signature,
                        },
                    };
                    // console.log('Websocket Signature Request', JSON.stringify(req, null, 2));
                    ws.send(JSON.stringify(req));
                    // ws.on('message', console.log);
                    this.onV2Message(ws, callback, topics);
                    // setTimeout(() => {
                    // }, 500);
                    return ws;
                }, endpoint);
                return ws;
            },
            user: function(topics, callback) {
               return this.userV2(topics, callback, stream + '/v2');
            },
            futuresUser: function(topics, callback) {
                return this.userV1(topics, callback, stream);
            },
            getSignature: function(base, path, signatureVersion) {
                if (!Huobi.options.APIKEY) throw Error('apiRequest: Invalid API Key');
                if (!Huobi.options.APISECRET) throw Error('signedRequest: Invalid API Secret');
                const accessKey =  Huobi.options.APIKEY,
                    signatureMethod = 'HmacSHA256',
                    timestamp = new Date().toISOString().replace(/\..+/, '');//.getTime()+ Huobi.info.timeOffset;

                let params;
                if (signatureVersion === '2.1') {
                    params = {
                        accessKey, signatureMethod, signatureVersion, timestamp,
                    };
                } else if (signatureVersion === '2') {
                    params = {
                        AccessKeyId: accessKey,
                        SignatureMethod: signatureMethod,
                        SignatureVersion: signatureVersion,
                        Timestamp: timestamp,
                    }
                }

                let query = Object.keys(params)
                .sort( (a,b)=> (a > b) ? 1 : -1 )
                .reduce(function (a, k) {
                    a.push(k + '=' + encodeURIComponent(params[k]));
                    return a;
                }, []).join('&');

                let source = 'GET' + '\n' + base + '\n' + path + '\n' + query;
                // console.log('Source:', source);
                let signature = crypto.createHmac('sha256', Huobi.options.APISECRET).update(source).digest('base64');//digest('hex'); // set the HMAC hash header
                // signature = encodeURIComponent(signature);
                return {params, signature};
                //console.log("Signature %s",signature);
            },
            // subscribe: function (topic, callback) {
            //     let doSymbolsToWebsocket = function () {
            //         if (Array.isArray(symbols)) {
            //             symbols.forEach(s => {
            //                 let channel = {};
            //                 channel.sub = "market." + s + ".depth.step0";
            //                 channel.id = new Date().getTime()+s;
            //                // Huobi.options.log(channel.sub);
            //                 ws.send(JSON.stringify(channel));
            //             });
            //         } else {
            //             let channel = {};
            //             channel.sub = "market." + symbols + ".depth.step0";
            //             channel.id = new Date().getTime() + symbols;
            //             ws.send(JSON.stringify(channel));
            //         }


            //     };
            //     if (Huobi.options.verbose) Huobi.options.log('Subscribed to ' + stream);
            //     ws.reconnect = Huobi.options.reconnect;
            //     ws.endpoint = new Date().getTime()+"depth";
            //     ws.isAlive = false;
            //     ws.on('open', handleSocketOpen.bind(ws, opened_callback ? doSymbolsToWebsocket  : opened_callback));
            //     ws.on('pong', handleSocketHeartbeat);
            //     ws.on('error', handleSocketError);
            //     ws.on('close', handleSocketClose.bind(ws, reconnect));
            //     ws.on('message', function (data) {
            //         data = pako.inflate(data,{ to: 'string' });
            //         //Huobi.options.log('ws data: ' + data);
            //         try {
            //             let msg = JSON.parse(data);
            //             if (msg.ping) {
            //                 ws.send(JSON.stringify({ pong: msg.ping }));
            //                // Huobi.options.log('ping: '+msg.ping  );
            //             } else if (msg.subbed) {
            //                 //Huobi.options.log('subbed: '+msg.id +" status: "+msg.status );
            //                  //options.log('subbed: '+msg.id +" status: "+msg.status );
            //             } else {
            //                 if (msg.status && msg.status == 'error') {
            //                     ws.send(JSON.stringify({ pong: msg.ping }));
            //                     // Huobi.options.log('ping: '+msg.ping  );
            //                     throw new Error(msg)
            //                 }
            //                 callback( JSON.parse(data) );
            //             }
            //         } catch (error) {
            //           //options.log('CombinedStream: Parse error: '+error.message +'-> '+ JSON.stringify(data) );
            //           Huobi.options.log('Parse error: ' + error.message);
            //         }
            //         // try {
            //         //     callback(JSON.parse(data));
            //         // } catch (error) {
            //         //     Huobi.options.log('Parse error: ' + error.message);
            //         // }
            //     });
            //     return ws;
            // },

            pull: function pull(callback) {

            },

            /**
             * Userdata websockets function
             * @param {function} callback - the callback function
             * @param {function} execution_callback - optional execution callback
             * @param {function} subscribed_callback - subscription callback
             * @return {undefined}
             */
            userData: function userData(callback, execution_callback = false, subscribed_callback = false) {
                let reconnect = function () {
                    if (Huobi.options.reconnect) userData(callback, execution_callback, subscribed_callback);
                };
                apiRequest(base + 'v1/userDataStream', {}, function (error, response) {
                    Huobi.options.listenKey = response.listenKey;
                    setTimeout(function userDataKeepAlive() { // keepalive
                        try {
                            apiRequest(base + 'v1/userDataStream?listenKey=' + Huobi.options.listenKey, {}, function (err) {
                                if (err) setTimeout(userDataKeepAlive, 60000); // retry in 1 minute
                                else setTimeout(userDataKeepAlive, 60 * 30 * 1000); // 30 minute keepalive
                            }, 'PUT');
                        } catch (error) {
                            setTimeout(userDataKeepAlive, 60000); // retry in 1 minute
                        }
                    }, 60 * 30 * 1000); // 30 minute keepalive
                    Huobi.options.balance_callback = callback;
                    Huobi.options.execution_callback = execution_callback;
                    const subscription = subscribe(Huobi.options.listenKey, userDataHandler, reconnect);
                    if (subscribed_callback) subscribed_callback(subscription.endpoint);
                }, 'POST');
            },

            /**
             * Subscribe to a generic websocket
             * @param {string} url - the websocket endpoint
             * @param {function} callback - optional execution callback
             * @param {boolean} reconnect - subscription callback
             * @return {WebSocket} the websocket reference
             */
            // subscribe: function (url, callback, reconnect = false) {
            //     return subscribe(url, callback, reconnect);
            // },

            /**
             * Subscribe to a generic combined websocket
             * @param {string} url - the websocket endpoint
             * @param {function} callback - optional execution callback
             * @param {boolean} reconnect - subscription callback
             * @return {WebSocket} the websocket reference
             */
            subscribeCombined: function (url, callback, reconnect = false) {
                return subscribeCombined(url, callback, reconnect);
            },

            /**
             * Returns the known websockets subscriptions
             * @return {array} array of web socket subscriptions
             */
            subscriptions: function () {
                return Huobi.subscriptions;
            },

            /**
             * Terminates a web socket
             * @param {string} endpoint - the string associated with the endpoint
             * @return {undefined}
             */
            terminate: function (endpoint) {
                if (Huobi.options.verbose) Huobi.options.log('WebSocket terminating:', endpoint);
                return terminate(endpoint);
            },

            /**
             * Websocket depth chart
             * @param {array/string} symbols - an array or string of symbols to query
             * @param {function} callback - callback function
             * @return {string} the websocket endpoint
             */
            depth: function depth(symbols, callback) {
                let reconnect = function () {
                    if (Huobi.options.reconnect) depth(symbols, callback);
                };

                let subscription;
                if (Array.isArray(symbols)) {
                    // if (!isArrayUnique(symbols)) throw Error('depth: "symbols" cannot contain duplicate elements.');
                    // let streams = symbols.map(function (symbol) {
                    //     return symbol.toLowerCase() + '@depth';
                    // });
                    // subscription = subscribeCombined(streams, callback, reconnect);
                } else {
                    let symbol = symbols;
                    subscription = subscribe(symbol, callback, reconnect);
                }
                return subscription.endpoint;
            },

            /**
             * Websocket depth cache
             * @param {array/string} symbols - an array or string of symbols to query
             * @param {function} callback - callback function
             * @param {int} limit - the number of entries
             * @return {string} the websocket endpoint
             */
            depthCache: function depthCacheFunction(symbols, callback, limit = 500) {
                let reconnect = function () {
                    if (Huobi.options.reconnect) depthCacheFunction(symbols, callback, limit);
                };

                let symbolDepthInit = function (symbol) {
                    //Huobi.options.log("symbolDepthInit ====="+symbol);
                    if (typeof Huobi.depthCacheContext[symbol] === 'undefined') Huobi.depthCacheContext[symbol] = {};

                    let context = Huobi.depthCacheContext[symbol];
                    context.snapshotUpdateId = null;
                    context.lastEventUpdateId = null;
                    context.messageQueue = [];

                    Huobi.depthCache[symbol] = { bids: {}, asks: {} };
                };

                let assignEndpointIdToContext = function (symbol, endpointId) {
                    if (Huobi.depthCacheContext[symbol]) {
                        let context = Huobi.depthCacheContext[symbol];
                        context.endpointId = endpointId;
                        //Huobi.options.log("symbol "+symbol+" endpointId "+endpointId);
                    }
                };

                let handleDepthStreamData = function (depth) {
                    let symbol = parseSymbol(depth);
                    let context = Huobi.depthCacheContext[symbol];
                  //  try {
                        depthHandler(depth);
                    // } catch (err) {
                    //     return terminate(context.endpointId, true);
                    // }
                    if (callback) callback(symbol, Huobi.depthCache[symbol], context);

                };

                // let getSymbolDepthSnapshot = function (symbol, cb) {
                //
                //     publicRequest(base + 'v1/depth', { symbol: symbol, limit: limit }, function (error, json) {
                //         if (error) {
                //             return cb(error, null);
                //         }
                //         // Store symbol next use
                //         json.symb = symbol;
                //         cb(null, json)
                //     });
                // };

                let updateSymbolDepthCache = function (json) {
                    // Get previous store symbol
                    let symbol = json.symb;
                    // Initialize depth cache from snapshot
                    Huobi.depthCache[symbol] = depthData(json);
                    // Prepare depth cache context
                    let context = Huobi.depthCacheContext[symbol];
                    context.snapshotUpdateId = json.lastUpdateId;
                    context.messageQueue = context.messageQueue.filter(depth => depth.u > context.snapshotUpdateId);
                    // Process any pending depth messages
                    for (let depth of context.messageQueue) {

                        /* Although sync errors shouldn't ever happen here, we catch and swallow them anyway
                           just in case. The stream handler function above will deal with broken caches. */
                        try {
                            depthHandler(depth);
                        } catch (err) {
                            // do nothing
                        }
                    }
                    delete context.messageQueue;
                    if (callback) callback(symbol, Huobi.depthCache[symbol]);
                };

                /* If an array of symbols are sent we use a combined stream connection rather.
                   This is transparent to the developer, and results in a single socket connection.
                   This essentially eliminates "unexpected response" errors when subscribing to a lot of data. */
                let subscription;
                if (Array.isArray(symbols)) {
                    if (!isArrayUnique(symbols)) throw Error('depthCache: "symbols" cannot contain duplicate elements.');

                    symbols.forEach(symbolDepthInit);
                    let streams = symbols.map(function (symbol) {
                        return symbol.toLowerCase();
                    });
                    subscription = subscribe(streams, handleDepthStreamData, reconnect, function () {
                    });

                    symbols.forEach(s => assignEndpointIdToContext(s, subscription.endpoint));
                } else {
                    let symbol = symbols;
                    symbolDepthInit(symbol);
                    subscription = subscribe(symbol, handleDepthStreamData, reconnect, function () {
                    });
                    assignEndpointIdToContext(symbol, subscription.endpoint);
                }
                return subscription.endpoint;
            },

            /**
             * Websocket staggered depth cache
             * @param {array/string} symbols - an array of symbols to query
             * @param {function} callback - callback function
             * @param {int} limit - the number of entries
             * @param {int} stagger - ms between each depth cache
             * @return {Promise} the websocket endpoint
             */
            depthCacheStaggered: function (symbols, callback, limit = 100, stagger = 200) {
                if (!Array.isArray(symbols)) symbols = [symbols];
                let chain = null;

                // symbols.forEach(symbol => {
                //     let promise = () => new Promise(resolve => {
                //         this.depthCache(symbol, callback, limit);
                //         setTimeout(resolve, stagger);
                //     });
                //     chain = chain ? chain.then(promise) : promise();
                // });
                let promise = () => new Promise(resolve => {
                    this.depthCache(symbols, callback, limit);
                    setTimeout(resolve, stagger);
                });
                chain = chain ? chain.then(promise) : promise();
                return chain;
            },

            /**
             * Websocket aggregated trades
             * @param {array/string} symbols - an array or string of symbols to query
             * @param {function} callback - callback function
             * @return {string} the websocket endpoint
             */
            aggTrades: function trades(symbols, callback) {
                let reconnect = function () {
                    if (Huobi.options.reconnect) trades(symbols, callback);
                };

                let subscription;
                if (Array.isArray(symbols)) {
                    if (!isArrayUnique(symbols)) throw Error('trades: "symbols" cannot contain duplicate elements.');
                    let streams = symbols.map(function (symbol) {
                        return symbol.toLowerCase() + '@aggTrade';
                    });
                    subscription = subscribeCombined(streams, callback, reconnect);
                } else {
                    let symbol = symbols;
                    subscription = subscribe(symbol.toLowerCase() + '@aggTrade', callback, reconnect);
                }
                return subscription.endpoint;
            },

            /**
             * Websocket raw trades
             * @param {array/string} symbols - an array or string of symbols to query
             * @param {function} callback - callback function
             * @return {string} the websocket endpoint
             */
            trades: function trades(symbols, callback) {
                let reconnect = function () {
                    if (Huobi.options.reconnect) trades(symbols, callback);
                };

                let subscription;
                if (Array.isArray(symbols)) {
                    if (!isArrayUnique(symbols)) throw Error('trades: "symbols" cannot contain duplicate elements.');
                    let streams = symbols.map(function (symbol) {
                        return symbol.toLowerCase() + '@trade';
                    });
                    subscription = subscribeCombined(streams, callback, reconnect);
                } else {
                    let symbol = symbols;
                    subscription = subscribe(symbol.toLowerCase() + '@trade', callback, reconnect);
                }
                return subscription.endpoint;
            },

            /**
             * Websocket klines
             * @param {array/string} symbols - an array or string of symbols to query
             * @param {string} interval - the time interval
             * @param {function} callback - callback function
             * @param {int} limit - maximum results, no more than 1000
             * @return {string} the websocket endpoint
             */
            chart: function chart(symbols, interval, callback, limit = 500) {
                let reconnect = function () {
                    if (Huobi.options.reconnect) chart(symbols, interval, callback, limit);
                };

                let symbolChartInit = function (symbol) {
                    if (typeof Huobi.info[symbol] === 'undefined') Huobi.info[symbol] = {};
                    if (typeof Huobi.info[symbol][interval] === 'undefined') Huobi.info[symbol][interval] = {};
                    if (typeof Huobi.ohlc[symbol] === 'undefined') Huobi.ohlc[symbol] = {};
                    if (typeof Huobi.ohlc[symbol][interval] === 'undefined') Huobi.ohlc[symbol][interval] = {};
                    if (typeof Huobi.ohlcLatest[symbol] === 'undefined') Huobi.ohlcLatest[symbol] = {};
                    if (typeof Huobi.ohlcLatest[symbol][interval] === 'undefined') Huobi.ohlcLatest[symbol][interval] = {};
                    if (typeof Huobi.klineQueue[symbol] === 'undefined') Huobi.klineQueue[symbol] = {};
                    if (typeof Huobi.klineQueue[symbol][interval] === 'undefined') Huobi.klineQueue[symbol][interval] = [];
                    Huobi.info[symbol][interval].timestamp = 0;
                }

                let handleKlineStreamData = function (kline) {
                    let symbol = kline.s;
                    if (!Huobi.info[symbol][interval].timestamp) {
                        if (typeof (Huobi.klineQueue[symbol][interval]) !== 'undefined' && kline !== null) {
                            Huobi.klineQueue[symbol][interval].push(kline);
                        }
                    } else {
                        klineHandler(symbol, kline);
                        if (callback) callback(symbol, interval, klineConcat(symbol, interval));
                    }
                };

                let getSymbolKlineSnapshot = function (symbol, limit = 500) {
                    publicRequest(base + 'v1/klines', { symbol: symbol, interval: interval, limit: limit }, function (error, data) {
                        // klineData(symbol, interval, data);
                        if (typeof Huobi.klineQueue[symbol][interval] !== 'undefined') {
                            for (let kline of Huobi.klineQueue[symbol][interval]) klineHandler(symbol, kline, Huobi.info[symbol][interval].timestamp);
                            delete Huobi.klineQueue[symbol][interval];
                        }
                        if (callback) callback(symbol, interval, klineConcat(symbol, interval));
                    });
                };

                let subscription;
                if (Array.isArray(symbols)) {
                    if (!isArrayUnique(symbols)) throw Error('chart: "symbols" cannot contain duplicate elements.');
                    symbols.forEach(symbolChartInit);
                    let streams = symbols.map(function (symbol) {
                        return symbol.toLowerCase() + '@kline_' + interval;
                    });
                    subscription = subscribeCombined(streams, handleKlineStreamData, reconnect);
                    symbols.forEach(element => getSymbolKlineSnapshot(element, limit));
                } else {
                    let symbol = symbols;
                    symbolChartInit(symbol);
                    subscription = subscribe(symbol.toLowerCase() + '@kline_' + interval, handleKlineStreamData, reconnect);
                    getSymbolKlineSnapshot(symbol, limit);
                }
                return subscription.endpoint;
            },

            /**
             * Websocket candle sticks
             * @param {array/string} symbols - an array or string of symbols to query
             * @param {string} interval - the time interval
             * @param {function} callback - callback function
             * @return {string} the websocket endpoint
             */
            candlesticks: function candlesticks(symbols, interval, callback) {
                let reconnect = function () {
                    if (Huobi.options.reconnect) candlesticks(symbols, interval, callback);
                };

                /* If an array of symbols are sent we use a combined stream connection rather.
                   This is transparent to the developer, and results in a single socket connection.
                   This essentially eliminates "unexpected response" errors when subscribing to a lot of data. */
                let subscription;
                if (Array.isArray(symbols)) {
                    if (!isArrayUnique(symbols)) throw Error('candlesticks: "symbols" cannot contain duplicate elements.');
                    let streams = symbols.map(function (symbol) {
                        return symbol.toLowerCase() + '@kline_' + interval;
                    });
                    subscription = subscribe(streams, callback, reconnect);
                } else {
                    let symbol = symbols.toLowerCase();
                    subscription = subscribe(symbol + '@kline_' + interval, callback, reconnect);
                }
                return subscription.endpoint;
            },

            /**
             * Websocket mini ticker
             * @param {function} callback - callback function
             * @return {string} the websocket endpoint
             */
            miniTicker: function miniTicker(callback) {
                let reconnect = function () {
                    if (Huobi.options.reconnect) miniTicker(callback);
                };
                let subscription = subscribe('!miniTicker@arr', function (data) {
                    let markets = {};
                    for (let obj of data) {
                        markets[obj.s] = {
                            close: obj.c,
                            open: obj.o,
                            high: obj.h,
                            low: obj.l,
                            volume: obj.v,
                            quoteVolume: obj.q,
                            eventTime: obj.E
                        };
                    }
                    callback(markets);
                }, reconnect);
                return subscription.endpoint;
            },

            /**
             * Websocket prevday percentage
             * @param {array/string} symbols - an array or string of symbols to query
             * @param {function} callback - callback function
             * @return {string} the websocket endpoint
             */
            prevDay: function prevDay(symbols, callback) {
                let reconnect = function () {
                    if (Huobi.options.reconnect) prevDay(symbols, callback);
                };

                let subscription;
                // Combine stream for array of symbols
                if (Array.isArray(symbols)) {
                    if (!isArrayUnique(symbols)) throw Error('prevDay: "symbols" cannot contain duplicate elements.');
                    let streams = symbols.map(function (symbol) {
                        return symbol.toLowerCase() + '@ticker';
                    });
                    subscription = subscribeCombined(streams, function (data) {
                        prevDayStreamHandler(data, callback);
                    }, reconnect);
                    // Raw stream for  a single symbol
                } else if (symbols) {
                    let symbol = symbols;
                    subscription = subscribe(symbol.toLowerCase() + '@ticker', function (data) {
                        prevDayStreamHandler(data, callback);
                    }, reconnect);
                    // Raw stream of all listed symbols
                } else {
                    subscription = subscribe('!ticker@arr', function (data) {
                        for (let line of data) {
                            prevDayStreamHandler(line, callback);
                        }
                    }, reconnect);
                }
                return subscription.endpoint;
            }
        }
    };

};
module.exports = api;

