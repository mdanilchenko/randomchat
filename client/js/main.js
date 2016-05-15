/**
 * Created by maksimdanilchenko on 10.05.16.
 */
var wsUri = "ws://randomchat.com:61010";    //Change it for your server
var chatApp = null;

(function (angular) {
    chatApp = angular.module('app', ['ngWebSocket'])
        .factory('MsgHd', function ($websocket) {
            var ws = $websocket(wsUri);
            var chatId = null;
            var collection = [];
            ws.onOpen(function () {
                console.log('Opened');      // Do Something after establishing connection
            });
            ws.onClose(function () {
                console.log('Closed');      // Connection was closed
            });
            ws.onError(function () {
                console.log('Error');       // Eval socket errors
            });
            ws.onMessage(function (message) {
                try {
                    var json = JSON.parse(message.data);
                    if (typeof json.action != "undefined") {
                        switch (json.action) {
                            case 'attempt_ended':       //Fired when user closed chat before opponent was found
                                chatId = null;
                                collection.push({from: 'system', text: 'Chat Ended'});
                                document.getElementById("action_btn").innerHTML = 'Start';
                                document.getElementById("msg").disabled = true;
                                document.getElementById("msg").value = '';
                                break;
                            case 'waiting_connect':     //Waiting for opponent
                                collection.splice(0, collection.length);
                                chatId = null;
                                break;
                            case 'chat_message':        //Message Estblished
                                collection.push({from: json.from, text: json.message});
                                break;
                            case 'chat_closed':         //Chat closed
                                chatId = null;
                                collection.push({from: 'system', text: 'Chat Ended'});
                                document.getElementById("action_btn").innerHTML = 'Start';
                                document.getElementById("msg").disabled = true;
                                document.getElementById("msg").value = '';
                                break;
                            case 'chat_connected':      //Chat created, opponent found
                                document.getElementById("msg").disabled = false;
                                document.getElementById("msg").value = '';
                                collection.splice(0, collection.length);
                                collection.push({from: 'system', text: 'Chat Connected'})
                                chatId = json.chat_id;
                                document.getElementById("msg").focus();
                                break;

                        }
                    }
                } catch (ex) {
                    console.log(ex);
                    console.log("Error parsing message");
                }
            });

            var methods = {
                collection: collection,     //Collection of messages in current chat
                send: function (obj) {      //Method for sending messages to server
                    ws.send(JSON.stringify(obj));
                },
                chat: function () {         //returns current chat id
                    return chatId;
                }
            };

            return methods;
        }).controller('MessagesController', function ($scope, MsgHd) {
            this.curMessage = '';
            $scope.MsgHd = MsgHd;
            this.evalStart = function () {
                var startButton = document.getElementById("action_btn").innerHTML;
                if (startButton == 'Start') {
                    document.getElementById("action_btn").innerHTML = 'Stop';
                    MsgHd.send({action: "start_chat"});
                } else {
                    if (MsgHd.chat() != null) {
                        MsgHd.send({action: "close_chat", chat_id: MsgHd.chat()});
                    } else {
                        MsgHd.send({action: "end_chat_attempt"});
                    }
                }
            };
            this.evalSend = function () {
                var messageToSend = document.getElementById("msg").value;
                if ((messageToSend.length > 0) && (MsgHd.chat != null)) {
                    MsgHd.send({action: "send_message", chat_id: MsgHd.chat(), message: messageToSend});
                    document.getElementById("msg").value = '';
                } else {
                    console.log("Empty message:" + messageToSend + "->");
                }
            };
            this.evalEnterPress = function () {
                this.evalSend();
            };

        });
    //Eval Enter press in message textarea
    chatApp.directive('ctEnter', function () {
        return function (scope, element, attrs) {
            element.bind("keydown keypress", function (event) {
                if (event.which === 13) {
                    scope.$apply(function () {
                        scope.$eval(attrs.ctEnter);
                    });
                    event.preventDefault();
                }
            });
        };
    });
})(window.angular);


