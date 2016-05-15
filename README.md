# Simple One-on-One WebSocket Chat

Here we have simple, easy to maintain and scale random anonimus One-on-One chat.
Back-end: **Node.js** and **Redis**;
Front-end: **Angular.js**;
Client-server comunication: **JSON API** transfered by **WebSocket** connection

## Dependencies

Chat server uses some third-party libs for Node.js. All dependencies described in ``/server/package.json`` file.
Fast installation can be done by single npm-command inside ``/server`` folder:
```
nmp install
```

## Configs

For configuring Server edit ``server/config.json``. Here is the list of parameters:
```
{
  "server":{
    "host":"192.168.10.10",     //WebSocket Server ip
    "port": 61010,              //WebSocket Server port
    "threads":1,                //Number of slave threads for node.js cluster
    "isSecure":false,           //ws or wss connection needed
    "wssKey":null,              //path to key.pem file for wss connection
    "wssCert":null              //path to cert.pem file for wss connection
  },
  "redis":{
    "host":"127.0.0.1",         //Redis host
    "port":6379,                //Redis port
    "database":0,               //Number of Redis DB
    "password":null             //Redis password or Null
  }
}
```

Client configuration made by editing first line in ``/client/js/main.js`` file:
```
var wsUri = "ws://randomchat.com:61010";    //Change it for your server ip and port
```

## API

I'll Add all information about the API so pleae whait a few days

## License and usage

License: MIT.
You can use this engine in all kinds of projects, feel free to fork, modify and upgrade.

