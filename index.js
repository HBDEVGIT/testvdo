var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require("fs"); 
var ss = require('socket.io-stream');
var path = require('path');
var fileType = require('file-type');
var clients = {};
var socketsOfClients = {};

var chatHistory = {};

/*
	var redis = require('redis');
	//var redisClient = redis.createClient('3000', '192.168.30.4');
	var redisClient = redis.createClient();

	redisClient.on('connect', function() {
		console.log('REDIS is connected');
	});

	redisClient.on("error", function (err) {
		console.log("Error " + err);
	});
*/

//CORS SETTING

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Credentials", "false");
    next();
});

app.use('/www', express.static('www'));
app.use('/Files', express.static('Files'));

app.get('/', function(req, res){
    res.sendFile(__dirname + '/www/demo.html');	
});


var port = process.env.PORT || 8080 ;
http.listen(port, function() {
    console.log("App is running on port " + port);
});

// http.listen(8080, function(){
//     console.log('listening at port *:8080 ');	
// });

io.on('connection', function(socket){
    //console.log(socket.client.conn.request);
    console.log('One new Connection with socket id >> '+socket.id+' is listening from remote address '+socket.client.conn.remoteAddress);

    var filename;
    var size;
    var per;
    var typeFlag;
    var fileTypeObj;
    ss(socket).on('file', function(stream, data, targetUser) {
        var currTimeStamp = (new Date().getTime());		
        var tempArr = data.name.split('.');
        data.name = currTimeStamp+'.'+tempArr[tempArr.length-1];				
        filename = path.basename(data.name);

        console.log("filename : >> "+filename);

        size = 0;
        per = "";
        typeFlag = 0;
        fileTypeObj = "";
        stream.on('data', function(chunk) {
            ++typeFlag;
            if(typeFlag == 1){
                console.log("FILE TYPE : >> %o ",fileType(chunk));
                fileTypeObj = fileType(chunk)
            }			
            size += chunk.length;
            per = Math.floor(size / data.size * 100) + '%';
            if(per == '100%'){
                var srcUser = socketsOfClients[socket.id];


                globalChatObj[srcUser]['chatArr'].push({"source": srcUser,"message": filename,"target": targetUser,"fileType":fileTypeObj, "msgTimeStamp":currTimeStamp });
                if (targetUser == "All") {
                    io.sockets.emit('message',{"source": srcUser,"message": filename,"target": targetUser,"fileType":fileTypeObj, "msgTimeStamp":currTimeStamp });
                }else{
                    io.to(clients[srcUser]).emit('message',{"source": srcUser,"message": filename,"target": targetUser,"fileType":fileTypeObj, "msgTimeStamp":currTimeStamp });
                    io.to(clients[targetUser]).emit('message',{"source": srcUser,"message": filename,"target": targetUser,"fileType":fileTypeObj, "msgTimeStamp":currTimeStamp });
                }
            }
        });	
        stream.pipe(fs.createWriteStream('./Files/'+filename));												
    });

    socket.on('message', function(msg) {
        //console.log("MESSAGE : >> ",msg);
        var currTimeStamp = (new Date().getTime());
        var srcUser = socketsOfClients[socket.id];
        var msgTime = (new Date());				
        globalChatObj[srcUser]['chatArr'].push({ "source": srcUser, "message": msg.message, "target": msg.target, "msgTimeStamp":currTimeStamp });
        if (msg.target == "All") {
            // broadcast			
            io.sockets.emit('message',{ "source": srcUser, "message": msg.message, "target": msg.target, "msgTimeStamp":currTimeStamp });
        } else {
            // Look up the socket id
            io.to(clients[srcUser]).emit('message',{ "source": srcUser, "message": msg.message, "target": msg.target, "msgTimeStamp":currTimeStamp });
            io.to(clients[msg.target]).emit('message',{ "source": srcUser, "message": msg.message, "target": msg.target, "msgTimeStamp":currTimeStamp });			
        }
    });

    socket.on('disconnect', function() {		
        var uName = socketsOfClients[socket.id];
        if(uName == undefined){
            console.log('An  old connection with socket id >> '+socket.id+' is stopped listening.');
        }else{
            console.log('USER  >> '+uName+' disconnected');
            deleteDisconnectedUserData(uName);			
            delete socketsOfClients[socket.id];
            delete clients[uName];		
            // relay this message to all the clients	
            userLeft(uName);
        }		
    })

    socket.on('set username', function(userName) {				
        if (clients[userName] === undefined) {
            // Does not exist ... so, proceed
            clients[userName] = socket.id;
            socketsOfClients[socket.id] = userName;
            userNameAvailable(socket.id, userName);			
            console.log("New User "+userName+" joined at socket >> "+socket.id);			
            userJoined(userName);
        } else {
            userNameAlreadyInUse(socket.id, userName);
        }
    });

    socket.on('typing', function (data) {
        io.to(clients[data.target]).emit('typing',{ username: socketsOfClients[socket.id]});
        //socket.broadcast.emit('typing', { username: socketsOfClients[socket.id]} );
    });
    socket.on('stop typing', function (data) {
        io.to(clients[data.target]).emit('stop typing',{ username: socketsOfClients[socket.id]});
        //socket.broadcast.emit('stop typing', { username: socketsOfClients[socket.id]} );
    });

    socket.on('chatHistory', function (data) {
        //console.log(data);
        var getChatArr = getChatHistory(data.source , data.target );
        socket.emit('chatHistory', getChatArr);
    });

    socket.on('logout', function (data) {
        socket.emit('logout');
        socket.disconnect();
    });
				
});

function deleteDisconnectedUserData(uName){
    delete globalChatObj[uName];
    for(var h in globalChatObj){
        for(var d in globalChatObj[h]['chatArr']){
            //console.log(globalChatObj[h]['chatArr'][d].target);
            if(globalChatObj[h]['chatArr'][d].target == uName){
                delete globalChatObj[h]['chatArr'][d];
            }
        }
    }
}

function userJoined(uName) {
    globalChatObj[uName] = {chatArr:[]}	
    var joiningTime = (new Date());
    Object.keys(socketsOfClients).forEach(function(sId) {
        //console.log(io.sockets.sockets)
        io.to(sId).emit('userJoined', { "userName": uName , "joiningTime":joiningTime});
    })
}
 
function userLeft(uName) {
    io.sockets.emit('userLeft', { "userName": uName });    
}
 
function userNameAvailable(sId, uName) {
    setTimeout(function() {
        //console.log(JSON.stringify(clients));
        var joiningTime = (new Date());    
        io.to(sId).emit('welcome', { "userName" : uName, "currentUsers": JSON.stringify(Object.keys(clients)) , "joiningTime":joiningTime}); 
    }, 500);
}
 
function userNameAlreadyInUse(sId, uName) {
    setTimeout(function() {
        io.to(sId).emit('error', { "userNameInUse" : true })    
    }, 500);
}



/* CHAT HISTORY LOGIC */
var globalChatObj = {};

function sortChronological( arrToSort){
    arrToSort.sort(function(a, b) {
        return parseFloat(a.msgTimeStamp) - parseFloat(b.msgTimeStamp);
    });
}

function initFilter(){
    if (!Array.prototype.filter) {
        Array.prototype.filter = function(fun /*, thisp*/) {
            var len = this.length >>> 0;
            if (typeof fun != "function"){
                throw new TypeError();
            }
            var res = [];
            var thisp = arguments[1];
            for (var i = 0; i < len; i++) {
                if (i in this) {
                    var val = this[i]; // in case fun mutates this
                    if (fun.call(thisp, val, i, this)){
                            res.push(val);
                    }
                }
            }
            return res;
        };
    }
}

initFilter();

function applyUserChatFilter(filterArr, srcUser, targetUser){
    var resultArr = filterArr.filter(function (el) {
      return el.source == srcUser && el.target == targetUser;
    });
    return resultArr;
}

function getChatHistory( srcUser, targetUser ){
    var srcArr = globalChatObj[srcUser]['chatArr'];
    var targetArr = globalChatObj[targetUser]['chatArr'];

    srcArr = applyUserChatFilter(srcArr, srcUser, targetUser);
    targetArr = applyUserChatFilter(targetArr, targetUser, srcUser );
    var mergedArr	=	srcArr.concat(targetArr);
    var sortedArr = mergedArr.slice(0);
    sortChronological( sortedArr );
    return sortedArr;
}
//getChatHistory( 'Rajeev', 'Smith' );


