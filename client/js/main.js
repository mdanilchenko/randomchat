/**
 * Created by maksimdanilchenko on 10.05.16.
 */
var wsUri = "ws://randomchat.com:61010";
var userMessages = []; //{text:String,from:String}
var chatApp = null;

console.log("Starting script");

//Functions to handle socket connection
function WsChat(wsUrl) {
    this.url = wsUrl;
    this.websocket = null;
    this.isConnected = false;
    this.chatId = null;
    this.connect = function () {
        console.log("Connecting..");
        this.websocket = new WebSocket(this.url);
        this.websocket.onopen = function (evt) {
            isConnected = true;
            console.log("WS CONNECTED");
            angular.element(document.getElementById('main_controller')).scope().messages.push({
                text: "Chat Connected",
                from: "you"
            });
            console.log(angular.element(document.getElementById('main_controller')).scope().messages);
        };
        this.websocket.onclose = function (evt) {
            this.isConnected = false;
            console.log("WS DISCONNECTED");
        };
        this.websocket.onmessage = function (evt) {
            console.log("WS MESSAGE:" + evt.data);
        };
        this.websocket.onerror = function (evt) {
            console.log("WS ERROR:" + evt.data);
        };
    }
    this.close = function () {
        if (this.websocket != null) {
            this.websocket.close();
        }
        document.getElementById("action_btn").innerHTML = 'Start';
        document.getElementById("msg").disabled = true;
        document.getElementById("msg").value = '';

    }

}


(function (angular) {
    console.log("Evaling Start...");
    chatApp = angular.module('app', ['ngWebSocket'])
        .factory('MsgHd', function ($websocket) {
            var ws = $websocket(wsUri);
            var chatId = null;
            var collection = [];
            ws.onOpen(function (){
                console.log('Opened');
            });
            ws.onClose(function (){
                console.log('Closed');
            });
            ws.onError(function (){
                console.log('Error');
            });
            ws.onMessage(function (message) {
                try{
                    console.log(message.data);
                    var json = JSON.parse(message.data);
                    if(typeof json.action!="undefined"){
                        switch(json.action){
                            case 'attempt_ended':
                                chatId=null;
                                collection.push({from:'system',text:'Chat Ended'});
                                document.getElementById("action_btn").innerHTML = 'Start';
                                document.getElementById("msg").disabled = true;
                                document.getElementById("msg").value = '';
                                break;
                            case 'waiting_connect':
                                collection.splice(0,collection.length);
                                chatId = null;
                                console.log("Waiting connect...")
                                break;
                            case 'chat_message':
                                collection.push({from:json.from,text:json.message});
                                break;
                            case 'chat_closed':
                                chatId=null;
                                collection.push({from:'system',text:'Chat Ended'});
                                document.getElementById("action_btn").innerHTML = 'Start';
                                document.getElementById("msg").disabled = true;
                                document.getElementById("msg").value = '';
                                break;
                            case 'chat_connected':
                                console.log('Starting...');
                                document.getElementById("msg").disabled = false;
                                document.getElementById("msg").value = '';
                                collection.splice(0,collection.length);
                                collection.push({from:'system',text:'Chat Connected'})
                                chatId = json.chat_id;
                                console.log("Chat connected...");
                                document.getElementById("msg").focus();
                                break;

                        }
                    }
                }catch(ex){
                    console.log(ex);
                    console.log("Error parsing message");
                }
                //console.log(message);
                //collection.push({text:"Hello",from:"you"});
            });

            var methods = {
                collection: collection,
                send: function (obj) {
                    ws.send(JSON.stringify(obj));
                },
                chat: function () {
                    return chatId;
                }
            };

            return methods;
        }).controller('MessagesController', function ($scope, MsgHd) {
            this.curMessage='';
            $scope.MsgHd = MsgHd;
            this.evalStart = function () {
                var startButton = document.getElementById("action_btn").innerHTML;
                if (startButton == 'Start') {
                    document.getElementById("action_btn").innerHTML = 'Stop';
                    MsgHd.send({action:"start_chat"});
                } else {
                    console.log('Stopping...');
                    if (MsgHd.chat() != null) {
                        MsgHd.send({action: "close_chat", chat_id: MsgHd.chat()});
                    }else{
                        MsgHd.send({action: "end_chat_attempt"});
                    }
                }
            };
            this.evalSend = function () {
                var messageToSend = document.getElementById("msg").value;
                if((messageToSend.length>0) && (MsgHd.chat!=null)){
                    console.log("Sending message...");
                    MsgHd.send({action:"send_message",chat_id:MsgHd.chat(),message:messageToSend});
                    document.getElementById("msg").value = '';
                }else{
                    console.log("Empty message:"+messageToSend+"->");
                }
            };
            this.evalEnterPress = function () {
                this.evalSend();
            };

        });


    /*chatApp.controller('MessagesController', ['$scope', function ($scope) {
        this.messages = [{text: "111 Connected", from: "you"}];
        this.curMessage = "";
        this.websocket = null;
        this.isConnected = false;
        this.chatId = null;
        this.connect = function (msg) {
            console.log("Connecting..");
            this.websocket = new WebSocket(wsUri);
            this.websocket.onopen = function (evt) {
                this.isConnected = true;
                console.log("WS CONNECTED");
                msg.push({text: "Chat Connected", from: "you"});
                console.log(messages);
            };
            this.websocket.onclose = function (evt) {
                this.isConnected = false;
                console.log("WS DISCONNECTED");
            };
            this.websocket.onmessage = function (evt) {
                console.log("WS MESSAGE:" + evt.data);
            };
            this.websocket.onerror = function (evt) {
                console.log("WS ERROR:" + evt.data);
            };
        }
        this.close = function () {
            if (this.websocket != null) {
                this.websocket.close();
            }
            document.getElementById("action_btn").innerHTML = 'Start';
            document.getElementById("msg").disabled = true;
            document.getElementById("msg").value = '';

        }
        this.evalStart = function () {
            var startButton = document.getElementById("action_btn").innerHTML;
            if (startButton == 'Start') {
                console.log('Starting...');
                this.connect();
                document.getElementById("action_btn").innerHTML = 'Stop';
                document.getElementById("msg").disabled = false;
                document.getElementById("msg").value = '';
            } else {
                console.log('Stopping...');
                $scope.chat.close();
            }
        };
        this.evalSend = function () {
            console.log(this.curMessage);
        };
        this.evalEnterPress = function () {
            this.evalSend();
        };

    }]);*/
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


