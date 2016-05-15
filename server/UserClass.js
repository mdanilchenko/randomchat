module.exports = function User(con,serverId) {
    this.generateUid = function(){
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    }
    this.id =this.generateUid();
    this.con = con;
    this.status = "sleep";
    this.chatId = null;
    this.serverId = serverId;
}