/****************************************************************************************
 *  Simple Random chat Server
 *  Author: Maksim Danilchenko, Gomel, Belarus
 *
 *  Licence: MIT
 *
 *  Description: Node.js+Redis chat for connecting random users base on Constant WebSocket connections.
 *  Used plugins:
 *      nodejs-websocket    - Simple Interface for Socket connection management
 *      safe-json-parse     - Async JSON parser
 *      redis               - API for Redis
 *
 ****************************************************************************************/

var fs = require('fs');
var jsonParse = require("safe-json-parse/callback");
var redis = require("redis");
var ws = require("nodejs-websocket");
var cluster = require('cluster');
require('tls').SLAB_BUFFER_SIZE = 100000;//100Kb
var User = require('./UserClass.js');

var redisClient = null;
var redisSubsClient = null;
var server = null;
var serverId = Math.round(Math.random() * 899 + 100);
//Default configs
var config = {
    server: {
        host: "192.168.10.10",
        port: 61010,
        threads: 5,
        isSecure: false,
        wssKey: null,
        wssCert: null
    },
    redis: {
        host: "127.0.0.1",
        port: 6379,
        database: 0,
        password: null
    }
}

//Vars for user management
var usersList = {};

readProjectSettings();  //Reading settings file
evalClusterStart();     //Starting servers in local cluster


//Evaling events made by clients
function serverCallBack(con) {
    con.on("text", function (str) {
        jsonParse(str, function (err, json) {
            if (err) {
                sendError("Request Parsing Failed", con);
            } else {
                evalUserRequest(json, con);
            }
        })
    });
    con.on("error", function (err) {
        console.log("Error in connection: ", err);
        con.close();
    });
    con.on("close", function (code, reason) {
        console.log("Closing user connection: ", reason);
        evalUserQuit(con);
    });
    createUserIfNotExists(con);
}

function evalUserRequest(req, con) {
    if (typeof req.action == "string") {
        switch (req.action) {
            case "start_chat":
                startUserChat(req, con);
                break;
            case "close_chat":
                closeUserChat(req, con);
                break;
            case "end_chat_attempt":
                endChatAttempt(req, con);
                break;
            case "send_message":
                sendChatMessage(req, con);
                break;
            default:
                sendError("Invalid action", con);
        }
    } else {
        sendError("Action not found", con);
    }
}
function evalSubscribeMessage(channel, message) {
    jsonParse(message, function (err, msg) {
        if (err) {
            console.log("Error parsing subscription message")
        } else {
            if ((typeof msg.to != "undefined") && (typeof usersList[msg.to] != "undefined") && (typeof usersList[msg.to].con != "undefined")) {
                if ((typeof msg.action != "undefined") && (msg.action == "chat_connected")) {
                    usersList[msg.to].chatId = msg.chat_id;
                }

                sendResponse(message, usersList[msg.to].con);
            } else if ((typeof msg.action != "undefined") && (msg.action == "close_chat")) {
                removeChatFromClients(msg.chat_id, true);
            }
        }
    })
}
function evalUnSubscribe(chatId, count) {
    removeChatFromClients(chatId, true);
}
function startUserChat(req, con) {
    try {
        var user = createUserIfNotExists(con);
        if (user.chatId != null) {
            var chatToClose = user.chatId;
            endChatAttempt({action: "end_chat_attempt", chat_id: chatToClose, isSilent: 1}, con);
            closeUserChat({action: "close_chat", chat_id: chatToClose, isSilent: 1}, con);
        }
        redisClient.hgetall("chatListAttempts", function (err, waitingChats) {
            if (err) {
                addChatToWaitList(user);
                sendResponse({action: "waiting_connect"}, con);
            } else {
                var isChatHandeled = false;
                for (var chatId in waitingChats) {
                    if (waitingChats[chatId].indexOf(user.id) == -1) {
                        jsonParse(waitingChats[chatId], function (err, chat) {
                            if (err) {
                                console.log("Error parsing chat");
                            } else {
                                moveChatToActive(user, chat);
                                sendResponse({action: "chat_connected", chat_id: chat.id}, con);
                            }
                        });

                        isChatHandeled = true;
                        break;
                    }
                }
                if (!isChatHandeled) {
                    addChatToWaitList(user);
                    sendResponse({action: "waiting_connect"}, con);
                }
            }
        });
    } catch (ex) {
        console.log(ex.stack);
    }
}
function closeUserChat(req, con) {
    if (typeof req.chat_id != "undefined") {
        redisClient.hdel("chatList", req.chat_id);
        redisSubsClient.unsubscribe(req.chat_id);
        redisClient.publish(req.chat_id, toJSON(req));
        removeChatFromClients(req.chat_id, true);
    }

}
function endChatAttempt(req, con) {
    var user = getUserIdByCon(con);
    if ((user != null) && (usersList[user].chatId != null)) {
        redisClient.hdel("chatListAttempts", usersList[user].chatId);
        redisSubsClient.unsubscribe(usersList[user].chatId);
        usersList[user].chatId = null;
        if (typeof req.isSilent == "undefined") {
            sendResponse({action: "attempt_ended"}, con);
        }
    } else {
        if (typeof req.isSilent == "undefined") {
            sendError("attempt not started", con);
        }
    }
}
function sendChatMessage(req, con) {
    if ((typeof req.chat_id == "string") && (req.chat_id.length > 0)) {
        if ((typeof req.message == "string") && (req.message.length > 0)) {
            var userId = getUserIdByCon(con);
            if ((userId != null) && (usersList[userId].chatId == req.chat_id)) {
                req.message = prepareChatMessage(req.message);
                redisClient.hget("chatList", usersList[userId].chatId, function (err, chatData) {
                    if (err) {
                        sendError("chat not found", con);
                    } else {
                        jsonParse(chatData, function (err, chatInfo) {
                            if (err) {
                                sendError("Request Parsing Failed", con);
                            } else {
                                if ((typeof chatInfo != "undefined") && (typeof chatInfo.user1 == "string")) {
                                    var from = "you";
                                    if (chatInfo.user1 != userId) {
                                        from = "stranger";
                                    }
                                    redisClient.publish(usersList[userId].chatId, toJSON({
                                        action: "chat_message",
                                        message: req.message,
                                        chat_id: usersList[userId].chatId,
                                        from: from,
                                        to: chatInfo.user1
                                    }));
                                }
                                if ((typeof chatInfo != "undefined") && (typeof chatInfo.user2 == "string")) {
                                    var from = "you";
                                    if (chatInfo.user2 != userId) {
                                        from = "stranger";
                                    }
                                    redisClient.publish(usersList[userId].chatId, toJSON({
                                        action: "chat_message",
                                        message: req.message,
                                        chat_id: usersList[userId].chatId,
                                        from: from,
                                        to: chatInfo.user2
                                    }));
                                }
                            }
                        })
                    }
                });
            } else {
                sendError("invalid chat", con);
            }
        } else {
            sendError("message is missing", con);
        }
    } else {
        sendError("chat id is missing", con);
    }
}

function startServer() {
    try {
        var redisOptions = {
            host: config.redis.host,
            port: config.redis.port,
            db: config.redis.database
        };
        if (config.redis.password != null) {
            redisOptions.password = config.redis.password;
        }
        redisClient = redis.createClient(redisOptions);
        redisSubsClient = redis.createClient(redisOptions);

        redisClient.del("chatList");
        redisClient.del("chatListAttempts");

        redisSubsClient.on("message", function (channel, message) {
            evalSubscribeMessage(channel, message);
        });
        redisSubsClient.on("unsubscribe", function (channel, count) {
            evalUnSubscribe(channel, count);
        });
        if (!config.server.isSecure) {
            server = ws.createServer({}, serverCallBack).listen(config.server.port, config.server.host);
        } else {
            var wss_options = {
                secure: true,
                key: fs.readFileSync(config.server.wssKey),
                cert: fs.readFileSync(config.server.wssCert)
            };
            server = ws.createServer(wss_options, serverCallBack).listen(config.server.port, config.server.host);
        }
    } catch (ex) {
        console.log("Error: Fail starting servers");
        console.log(ex.stack);
    }
}
function evalClusterStart() {
    if (cluster.isMaster) {
        for (var i = 0; i < config.server.threads; i++) {
            cluster.fork();
        }
    } else {
        startServer();
    }
}
function readProjectSettings() {
    var data = fs.readFileSync('config.json');
    var json = JSON.parse(data);
    if ((typeof json != "undefined") && (typeof json.server != "undefined")) {
        config.server = json.server;
    }
    if ((typeof json != "undefined") && (typeof json.redis != "undefined")) {
        config.redis = json.redis;
    }
}
function evalUserQuit(con) {
    var userId = getUserIdByCon(con);
    if ((userId != null) && (typeof usersList[userId] != "undefined")) {
        if (usersList[userId].chatId != null) {
            redisClient.hdel("chatList", usersList[userId].chatId);
            redisClient.publish(usersList[userId].chatId, toJSON({
                "action": "close_chat",
                chat_id: usersList[userId].chatId
            }));
            redisSubsClient.unsubscribe(usersList[userId].chatId);
            removeChatFromClients(usersList[userId].chatId, true);
        }
        delete usersList[userId];
    }
}
function sendResponse(data, con) {
    try {
        var json = data;
        if (typeof data != "string") {
            json = JSON.stringify(data);
        }
        con.sendText(json);
    } catch (ex) {
        console.log("Error: Cant convert data to JSON", data);
    }
}
function sendError(desc, con) {
    try {
        var json = JSON.stringify({error: desc});
        con.sendText(json);
    } catch (ex) {
        console.log("Error: Cant convert data to JSON", data);
    }
}

//searching Functions
function getUserIdByCon(con) {
    var user = null;
    for (var userEntry in usersList) {
        if (usersList.hasOwnProperty(userEntry)) {
            if (usersList[userEntry].con == con) {
                return usersList[userEntry].id;
            }
        }
    }
    return user;
}
//Support functions

function getCurrentTime() {
    return Math.floor(Date.now() / 1000);
}
function createUserIfNotExists(con) {
    var userId = getUserIdByCon(con);
    var user = null;
    if (userId == null) {
        user = new User(con, serverId);
        usersList[user.id] = user;
    } else {
        user = usersList[userId];
    }
    return user;
}
function generateChatId() {
    return getCurrentTime() + "c" + Math.round(Math.random() * 9000 + 1000);
}
function toJSON(obj) {
    try {
        return JSON.stringify(obj);
    } catch (ex) {
        console.log(ex);
        return null;
    }
}
function removeChatFromClients(chat, needSendCloseMsg) {
    for (var user in usersList) {
        if (usersList.hasOwnProperty(user) && (usersList[user].chatId == chat)) {
            usersList[user].chatId = null;
            if ((needSendCloseMsg) && (typeof usersList[user].con != "undefined") && (usersList[user].con.readyState == usersList[user].con.OPEN)) {
                sendResponse({action: "chat_closed", chat_id: chat}, usersList[user].con);
            }
        }
    }
}
function moveChatToActive(user, chat) {
    redisClient.hdel("chatListAttempts", chat.id);
    redisClient.hmset("chatList", chat.id, toJSON({id: chat.id, user1: chat.user1, user2: user.id}));
    if (typeof usersList[user.id] != "undefined") {
        usersList[user.id].chatId = chat.id;
    }
    redisClient.publish(chat.id, toJSON({"action": "chat_connected", chat_id: chat.id, to: chat.user1}));
    redisSubsClient.subscribe(chat.id);
}
function addChatToWaitList(user) {
    var chatId = generateChatId();
    usersList[user.id].chatId = chatId;
    redisClient.hmset("chatListAttempts", chatId, toJSON({id: chatId, user1: user.id, user2: null}));
    redisSubsClient.subscribe(chatId);
}
function prepareChatMessage(msg) {
    return msg.replace(/<\/?[^>]+>/gi, '');
    ;
}
//Debug
function dumpRedis(variable) {
    redisClient.hgetall(variable, function (err, obj) {
        console.dir(obj);
    });
}