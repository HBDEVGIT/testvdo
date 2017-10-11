var socket = io();

var myUserName;
var $inputUserName;
var $inputMessage;	
var $inputFile;
var $progressBar;
var currentTargetUser = "";
var typing = false;
var lastTypingTime;
var TYPING_TIMER_LENGTH = 400;	

function handleBodyLoad(){
	$inputUserName = $('input#userName');
	$inputMessage = $('textarea#msg');
	$inputFile = $("input#file");
	$progressBar = $("#progressBar");
	$emoticonCnt = $("#emoticon_cnt");
	$currentUserCnt = $("#current_target_user_text_cnt");
	
	//$inputUserName.change(setUsername);
	$inputUserName.keypress(function(e) {
		if (e.keyCode == 13) {			
			setUsername();
			e.stopPropagation();
			e.stopped = true;
			e.preventDefault();
		}
	});		
	$inputMessage.keypress(function(e) {
		if (e.keyCode == 13) {
			sendMessage();
			e.stopPropagation();
			e.stopped = true;
			e.preventDefault();
		}
	});
	
	$inputMessage.on('input', function() {
		updateTyping();
	});
	$inputUserName.focus();
	
	$("#add_attachment_button").bind('click',function(){
        $inputFile.trigger('click'); 
        return false;
	});
	
	$inputFile.change(function(e) {
		var file = e.target.files[0];
		ss.forceBase64 = true;
		var stream = ss.createStream(); // { highWaterMark: 10024, objectMode: true, allowHalfOpen: true }		
		// upload a file to the server. 
		console.log("FILE NAME : "+file.name);
		ss(socket).emit('file', stream, {name: file.name, size: file.size}, currentTargetUser );		
		var blobStream = ss.createBlobReadStream(file);
		var size = 0;	
		blobStream.on('data', function(chunk) {			
			size += chunk.length;
			per = Math.floor(size / file.size * 100);
			//console.log(per);
			$progressBar.show();
			progress(per, $progressBar);			
			if(per == 100){				
				$progressBar.hide();
				$progressBar.html('<div></div>');
				$("#file").val('');
				console.log("File : [%s] transfer 100% success!!!", file.name);
			}
		});	
		blobStream.pipe(stream);				
	});
	
	$("#chat_symbol").bind('click',function(){
		$emoticonCnt.toggle();
	});
	$("#emoticon_cnt li").bind('click',function(){
		$inputMessage.val($inputMessage.val()+' '+$(this).find('span').html());
		$emoticonCnt.toggle();
	});
	
}

$(function() {
	socket.on('userJoined', function(msg) {
		
		appendNewUser(msg.userName, true, msg.joiningTime);
	});		
	socket.on('userLeft', function(msg) {
		handleUserLeft(msg);
	});		
	socket.on('message', function(msg) {			
		appendNewMessage(msg);
	});		
	socket.on('welcome', function(msg) {					
		if(myUserName == msg.userName){
			setFeedback("Username available, you can begin chatting.");
			setTimeout(function(){
				hideLoginOverlay();
				$inputMessage.focus();
			},1000);
			setCurrentUsers(msg.currentUsers,msg.joiningTime)			
		}										
	});		
	socket.on('error', function(msg) {
		if (msg.userNameInUse) {
			setFeedback("Username already in use, try another name.");
		}
	});		
	socket.on('typing', function (data) {
		if(data.username == $currentUserCnt.text()){
			$("#user_typing_main_cnt .write-user").text(data.username);
			$("#user_typing_main_cnt").show();
		}else{
			$("li[u-name='"+data.username+"'] .list-user-typing-main-cnt").show();
		}		
	});				
	socket.on('stop typing', function (data) {
		if(data.username == $currentUserCnt.text()){
			$("#user_typing_main_cnt .write-user").text('User');
			$("#user_typing_main_cnt").hide();
		}else{
			$("li[u-name='"+data.username+"'] .list-user-typing-main-cnt").hide();
		}		
	});
	
	socket.on('connect', function(){			
		console.log("CONNECTED");
	});
	
	socket.on('chatHistory', function(ch){			
		for(var t in ch){
			appendNewMessage(ch[t]);
		}
	});
	
	
	socket.on('logout', function(data){			
		//console.log("HANDLE LOGOUT");
		$("#user_list ul").html('');
		hideRightChatArea();
		showLoginOverlay();
		socket.connect();
	});
	
});

function updateTyping () {					
	if (!typing) {
		typing = true;
		socket.emit('typing',{'source': myUserName ,'target': $currentUserCnt.text()});
	}
	lastTypingTime = (new Date()).getTime();		
	setTimeout(function () {
		var typingTimer = (new Date()).getTime();
		var timeDiff = typingTimer - lastTypingTime;
		if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
			socket.emit('stop typing',{'source': myUserName ,'target': $currentUserCnt.text()});
			typing = false;
		}
	}, TYPING_TIMER_LENGTH);
}

function appendNewMessage(msg) {
	console.log(msg)
	
	if(msg.source != $currentUserCnt.text() && msg.source != myUserName){
		return false;
	}
	
	var serverDateObj = new Date(msg.msgTimeStamp);
	var msgDate = $.format.date(serverDateObj,"MMM PD yyyy");
	var msgTime = $.format.date(serverDateObj,"HH:ii:ss a");	
	var lastDateText = $($(".outgoing-date")[$(".outgoing-date").length-1]).text();;
	var mainHtml = "";
	var dateHtml = "";
	if(lastDateText == "" || lastDateText != msgDate){
		dateHtml += '<div class="outgoing-date clearfix"><div class="midd-date">'+msgDate+'</div></div>';	
	}
	var msgSource = msg.source; 
	mainHtml += dateHtml;
	
	var mediaHtml = "";
	var messageContentHtml = "";
		
	if(msg.fileType != undefined && msg.fileType != null){
		var filePath = "'Files/"+msg.message+"'";
		downloadHtml = '<label class="download-cnt" onclick="handleDownLoadFile('+filePath+')">&#8517;ownload</label>';			
		if(msg.fileType.mime.indexOf('image') != -1){
			mediaHtml = "<img src="+filePath+">";				
			messageContentHtml += "<p><a href="+filePath+" target='_blank'>"+mediaHtml+"</a>"+downloadHtml+"</p>";
		}else if(msg.fileType.mime.indexOf('video') != -1){
			mediaHtml = "<video width='100%' controls><source src="+filePath+" type='"+msg.fileType.mime+"'></video>";
			messageContentHtml += "<p><a href="+filePath+" target='_blank'>"+mediaHtml+"</a>"+downloadHtml+"</p>";
		}else if(msg.fileType.mime.indexOf('audio') != -1){
			mediaHtml = "<audio width='100%' controls><source src="+filePath+" type='"+msg.fileType.mime+"'></audio>";
			messageContentHtml += "<p><a href="+filePath+" target='_blank'>"+mediaHtml+"</a>"+downloadHtml+"</p>";
		}else if(msg.fileType.mime.indexOf('pdf') != -1){
			messageContentHtml += "<p><a href="+filePath+" target='_blank'>"+msg.message+"</a>"+downloadHtml+"</p>";
		}else if(msg.fileType.mime.indexOf('zip') != -1){
			messageContentHtml += "<p><a href="+filePath+" target='_blank'>"+msg.message+"</a>"+downloadHtml+"</p>";
		}else{
			messageContentHtml += "<p>"+msg.message+"</p>";
		}			
	}else{
		messageContentHtml += "<p>"+msg.message+"</p>";
	}
	
	if(msgSource != myUserName){
		mainHtml += '<div class="incoming-msg clearfix">';
	}else{
		mainHtml += '<div class="outgoing-msg clearfix">';
	}
	mainHtml += '<div class="msg-box clearfix">';				
	mainHtml += messageContentHtml;				
	mainHtml += '<span>'+msgTime+'<i class="tick-mark">&nbsp;</i></span>';
	mainHtml += '</div>';
	mainHtml += '</div>';
	
	$('#main_chat_cnt').append(mainHtml);
	$("#main_chat_cnt").animate({scrollTop: $('#main_chat_cnt')[0].scrollHeight}, 1000);
}

function appendNewUser(uName, notify, joiningTime) {
	if(joiningTime != "" && joiningTime != null || joiningTime != undefined){
		joiningTime = new Date(joiningTime);
		joiningTime = $.format.date(joiningTime,"MMM PD yyyy");
	}else{
		joiningTime = "";
	}
	
	var strUserName = "'"+uName+"'"; 
	var userHtml = "";
	userHtml +='<li u-name="'+uName+'" onclick="handleSelectUser('+strUserName+')">';
		userHtml +='<div class="notified-msg clearfix">';
			userHtml +='<div class="user-photo"><span><img src="www/images/hiddenbrains-logo.png" alt=""></span></div>';
			userHtml +='<div class="user-name">';
				userHtml +='<div class="user-name-show">'+uName+'<span class="pull-right date">'+joiningTime+'</span></div>';
				userHtml +='<div class="contact-msg"><i class="tick-mark"></i> Active</div>';				
				userHtml +='<div class="list-user-typing-main-cnt" style="display:none;"><span>typing </span><span class="write-dots">....</span><span class="write-symbol">✎</span></div>';				
			userHtml +='</div>';
		userHtml +='</div>';
	userHtml +='</li>';
	$("#user_list ul").append(userHtml);
}

function handleUserLeft(msg) {
	$("li[u-name='"+msg.userName+"']").remove();
	if(msg.userName == $currentUserCnt.text()){
		hideRightChatArea();
	}
}

function setFeedback(fb) {
	$(".login-message-cnt span").text(fb);
}

function setUsername() {
	myUserName = $inputUserName.val();
	$("#logged_user_main_cnt").html("<span>Logged in user : <label class=''>"+myUserName+"</label></span><span class='logout-cnt' onclick='handleLogout()'><img src='www/images/logout.png'/></span>");
	socket.emit('set username', myUserName, function(data) { });
	console.log('Set user name as ' + myUserName);
}

function handleLogout(){
	//socket.emit('logout', myUserName);
	
	socket.disconnect();
	$("#user_list ul").html('');
	hideRightChatArea();
	$("#userName").val('');
	$(".login-message-cnt span").html('');
	showLoginOverlay();
	socket.connect();
}

function sendMessage() {
	var trgtUser = currentTargetUser;
	socket.emit('message', {"message": $inputMessage.val(),"target": trgtUser});				
	$inputMessage.val("");
}

function setCurrentUsers(usersStr, joiningTime) {
	$("#user_list ul").html("");
	JSON.parse(usersStr).forEach(function(name) {
		if(name != myUserName){
			appendNewUser(name, false, joiningTime);
		}					
	});
}		

function showLoginOverlay(){
	$(".login-overlay").show();
}

function hideLoginOverlay(){
	$(".login-overlay").hide();
}

function showRightChatArea(){
	$("#right_chat_area").show();
}

function hideRightChatArea(){
	$("#right_chat_area").hide();
}

function handleSelectUser(ctu){
	currentTargetUser = ctu;
	$currentUserCnt.text(currentTargetUser);
	$("#main_chat_cnt").html('');
	showRightChatArea();
	requestChatHistory(myUserName,currentTargetUser);	
}

function requestChatHistory(sourceUser,targetUser){
	socket.emit('chatHistory', {"source":sourceUser ,"target": targetUser});
}

function progress(percent, $element) {
	var progressBarWidth = percent * $element.width() / 100;
	$element.find('div').animate({ width: progressBarWidth }, 0).html('<span>'+percent+'% </span>');
}

function handleDownLoadFile(fileName){
	var a = $("<a>").attr("href", fileName).attr("download", fileName).appendTo("body");
	a[0].click();
	a.remove();
}








