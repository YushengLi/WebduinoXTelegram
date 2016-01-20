var Settings = require('./secrets.json');

const AdminID = Settings.Telegram.AdminID;

// 
var Bot = require('telegram-api');

// require message types needed
var Message  = require('telegram-api/types/Message');
var Question = require('telegram-api/types/Question');
var Keyboard = require('telegram-api/types/Keyboard');

const nonKeyboard = new Keyboard().keys([]).hide();

var Webduino = require('webduino-js');
const board = new Webduino.WebArduino(Settings.Webduino.DeviceID);

var operationalMode      = 'Manual';
var runAutoMode          = '';
var autoModeInitiateTime = '';
var msecPerMinute        = 1000 * 60;
var msecPerHour          = msecPerMinute * 60;
var msecPerDay           = msecPerHour * 24;
var lastWateringTime     = '';
var lastFeedingTime		 = '';
var lastMoistureWarningTime      = '';
var lastLightOpenNoticeTime      = '';

var bot = new Bot({
	token: Settings.Telegram.Token
});

const questionLight = new Question({
	text: 'What should I do with the light?',
	answers: [['Toggle LED 燈'], ['閃爍 LED 燈'], ['開燈', '關燈'], ['檢查 LED 狀態']]
});

const questionStatus = new Question({
	text: 'What status do you want to check?',
	answers: [['全部狀態'], ['植物狀態'], ['澆水狀態'], ['LED 燈狀態'], ['餵食狀況'], ['現行模式']]
});

const modeOptions = new Question({
	text: 'Please choose the mode you want to set.',
	answers: [['手動模式'], ['自動模式']]
});

// Start Telegram Bot
bot.start().catch(function(err) {
	console.error(err, '\n', err.stack);
});

bot.on('update', function(update) {
	console.log('Polled\n', update);
});

board.on('ready', function() {
	board.samplingInterval = 500;
	const led  = new Webduino.module.Led(board, board.getDigitalPin(Settings.Webduino.Led.DigitalPin));  
 	const pump = new Webduino.module.Led(board, board.getDigitalPin(Settings.Webduino.Pump.DigitalPin));
 	led.off();
 	const servo = new Webduino.module.Servo(board, board.getDigitalPin(Settings.Webduino.Servo.DigitalPin));
  	const photocell = new Webduino.module.Photocell(board, Settings.Webduino.Photocell.AnalogPin);
  	const moisture  = new Webduino.module.Photocell(board, Settings.Webduino.Moisture.AnalogPin);

  	var photocellTrans = 0;
  	var moistureTrans  = 0;

  	photocell.on(function(val) {
	    photocell.detectedVal = val;
	    photocellTrans = (Math.round((((photocell.detectedVal - (0)) * (1/((1)-(0)))) * ((100)-(0)) + (0))*100))/100;
	});

	moisture.on(function(val) {
		moisture.detectedVal = val;
		moistureTrans = (Math.round((((moisture.detectedVal - (0)) * (1/((1)-(0)))) * ((1023)-(0)) + (0))*100))/100;
	});

	if(operationalMode == 'Auto') {
		console.log('現在被設置為：'+operationalMode);
		led.on();
	}

	bot.command('light', function(message) {
		const id = message.chat.id;
		console.log(message.chat);

		if(operationalMode == 'Auto') {
			var msg = new Message().to(id).text('此動作僅在手動模式下可用，你目前所使用的模式為自動模式。\n你可以透過 /setmode 來更改模式。').keyboard(nonKeyboard);
			bot.send(msg);
		} else {
			questionLight.to(message.chat.id).reply(message.message_id);
		  	bot.send(questionLight).then(function(answer) {
		    	var msg = new Message().to(id).text('您的指令: ' + answer.text).keyboard(nonKeyboard);
		    	bot.send(msg);
		    	console.log("指令：" + answer.text);
		    
		    	switch(answer.text) {
			    	case "檢查 LED 狀態":
			    		var lightStatus;
			    		if(led._blinkTimer != null) {
			    			lightStatus = new Message().to(id).text('️💡LED 狀態：閃爍中，間隔：'+led._blinkTimer._idleTimeout+' ms');
			    		} else if (led._pin._value == 0) {
			    			lightStatus = new Message().to(id).text('❗️LED 狀態：關閉中。');
			    		} else if (led._pin._value == 1) {
			    			lightStatus = new Message().to(id).text('💡LED 狀態：開啟中。');
			    		}
			    		bot.send(lightStatus);
			    		break;
			    	
			    	case "Toggle LED 燈":
			    		led.toggle();
			    		break;
			    	
			    	case "閃爍 LED 燈":
			    		led.blink(500);
			    		break;

			    	case "開燈":
			    		led.on();
			    		break;
			    	
			    	case "關燈":
			    		led.off();
			    		break;
		   		}
		  	}, function() {
		    	const msg = new Message().to(id).text('This is not a valid answer');
		    	bot.send(msg);
		  	});
		}
	
	});

	bot.command('servo', function(message) {
		const id = message.chat.id;
		console.log(message.chat);

		if(operationalMode == 'Auto') {
			var msg = new Message().to(id).text('此動作僅在手動模式下可用，你目前所使用的模式為自動模式。\n你可以透過 /setmode 來更改模式。').keyboard(nonKeyboard);
			bot.send(msg);
		} else if (hoursElapsed(lastFeedingTime) > 12 || lastFeedingTime == '') {
			feedingTheFish();
			lastFeedingTime = new Date();
			var msg = new Message().to(id).text('已啟動餵食。').keyboard(nonKeyboard);
			bot.send(msg);
		} else {
			var msg = new Message().to(id).text('距上次餵魚時間未足 12 小時，上次餵食時間是：'+lastFeedingTime+'。').keyboard(nonKeyboard);
			bot.send(msg);
		}	
	});

	bot.command('status', function(message) {
		const id = message.chat.id;
	  	console.log(message.chat);

	  	questionStatus.to(message.chat.id).reply(message.message_id);
	  	bot.send(questionStatus).then(function(answer) {
		    console.log("指令：檢查"+answer.text);

		    switch(answer.text) {
		    	case "全部狀態":
		    		break;
		    	
		    	case "植物狀態":
		    		if(moistureTrans >= 1000) {
		    			moistness = "‼️感測器未連接或是不在土裡"; 
		    		} else if (moistureTrans < 1000 && moistureTrans >= 600) {
		    			moistness = "❗土是乾的";
		    		} else if (moistureTrans < 600 && moistureTrans >= 370) {
		    			moistness = "💧土壤濕度正常";
		    		} else if (moistureTrans < 370) {
		    			moistness = "💦土是濕的";
		    		}

		    		lightness = (photocellTrans < 50) ? "🌞亮" : "❗️暗"		    
				    var msg = new Message().to(id).text(lightness+ "\n光度：" +photocellTrans+ "\n" +moistness+"\n土壤濕度："+moistureTrans).keyboard(nonKeyboard);
				    bot.send(msg);
		    		break;

		    	case "澆水狀態":
		    		if (lastWateringTime == '' && operationalMode != 'Auto') {
		    			var msg = new Message().to(id).text('未有任何澆水紀錄。\n透過指令 /watering 來餵魚。').keyboard(nonKeyboard);
		    			bot.send(msg);
		    		} else if (hoursElapsed(lastFeedingTime) < 8) {
		    			var msg = new Message().to(id).text('距上次澆水時間未足 8 小時，上次澆水時間是：'+lastWateringTime+'。').keyboard(nonKeyboard);
						bot.send(msg);
		    		} else if (hoursElapsed(lastFeedingTime) >= 8) {
		    			var msg = new Message().to(id).text('距上次澆水時間超過 8 小時，上次澆水時間是：'+lastWateringTime+'，已過 ' +hoursElapsed(lastWateringTime)+' 小時。\n透過指令 /watering 來餵魚。').keyboard(nonKeyboard);
						bot.send(msg);
		    		}
		    		break;

		    	case "LED 燈狀態":
		    		var lightStatus;
		    		if(led._blinkTimer != null) {
		    			lightStatus = new Message().to(id).text('️💡LED 狀態：閃爍中，間隔：'+led._blinkTimer._idleTimeout+' ms');
		    		} else if (led._pin._value == 0) {
		    			lightStatus = new Message().to(id).text('❗️LED 狀態：關閉中。');
		    		} else if (led._pin._value == 1) {
		    			lightStatus = new Message().to(id).text('💡LED 狀態：開啟中。');
		    		}
		    		bot.send(lightStatus);
		    		break;

		    	case "餵食狀況":
		    		if (lastFeedingTime == '' && operationalMode != 'Auto') {
		    			var msg = new Message().to(id).text('未有任何餵食紀錄。\n透過指令 /servo 來餵魚。').keyboard(nonKeyboard);
		    			bot.send(msg);
		    		} else if (hoursElapsed(lastFeedingTime) < 12) {
		    			var msg = new Message().to(id).text('距上次餵魚時間未足 12 小時，上次餵食時間是：'+lastFeedingTime+'。').keyboard(nonKeyboard);
						bot.send(msg);
		    		} else if (hoursElapsed(lastFeedingTime) >= 12) {
		    			var msg = new Message().to(id).text('距上次餵魚時間超過 12 小時，上次餵食時間是：'+lastFeedingTime+'，已過 ' +hoursElapsed(lastFeedingTime)+' 小時。\n透過指令 /servo 來餵魚。').keyboard(nonKeyboard);
						bot.send(msg);
		    		}
		    		break;

		    	case "現行模式":
		    		var currentMode = '';
		    		console.log(operationalMode);
		    		if (operationalMode == 'Manual') {
		    			currentMode = '手動模式';
		    		} else if (operationalMode == 'Auto') {
		    			currentMode = '自動模式';
		    		}

		    		var msg = new Message().to(id).text('現行模式：'+currentMode).keyboard(nonKeyboard);
		    		bot.send(msg);
		    		break;
		    }
	  	});
	});

	bot.command('setmode', function(message) {
		const id = message.chat.id;
	  	console.log(message.chat);

	  	var currentMode = '';
		console.log(operationalMode);
		if (operationalMode == 'Manual') {
			currentMode = '手動模式';
		} else if (operationalMode == 'Auto') {
			mode = '自動模式';
		}

	  	modeOptions.text("目前模式："+currentMode+"\nPlease choose the mode you want to set.").to(message.chat.id).reply(message.message_id);
	  	
	  	bot.send(modeOptions).then(function(answer) {
	  		console.log("指令：設定模式為"+answer.text);
	  		switch (answer.text) {
	  			case "手動模式":
	  				operationalMode = 'Manual';
	  				clearInterval(runAutoMode);
	  				var msg = new Message().to(id).text('已將模式設置為：'+answer.text+'。').keyboard(nonKeyboard);
	  				bot.send(msg);
	  				break;
	  			case "自動模式":
	  				autoModeInitiateTime = new Date();
	  				operationalMode = 'Auto';
	  				var msg = new Message().to(id).text('已將模式設置為：'+answer.text+'。').keyboard(nonKeyboard);
	  				bot.send(msg);
	  				runAutoMode = setInterval(function(){ autoMode(id) }, 5000);
	  				break;
	  		}
	  	});

	});

	bot.command('watering', function(message) {
		if (operationalMode == 'Auto') {
			var msg = new Message().to(message.chat.id).text('此動作僅在手動模式下可用，你目前所使用的模式為自動模式。\n你可以透過 /setmode 來更改模式。').keyboard(nonKeyboard);
			bot.send(msg);
		} else if (hoursElapsed(lastWateringTime) > 8 || lastWateringTime == '') {
			watering();
			lastFeedingTime = new Date();
			var msg = new Message().to(message.chat.id).text('已啟動澆水。').keyboard(nonKeyboard);
			bot.send(msg);
		} else {
			var msg = new Message().to(message.chat.id).text('距上次澆水時間未足 8 小時，上次澆水時間是：'+lastFeedingTime+'。').keyboard(nonKeyboard);
			bot.send(msg);
		}	
	});
	
	function autoMode(id) {
		console.log(operationalMode);
		console.log('自動模式執行中...')
		
		if (operationalMode == 'Auto' && minutesElapsed(autoModeInitiateTime) <= 30) {
			if (photocellTrans > 50) {
				if(hoursElapsed(lastLightOpenNoticeTime) >=1 || lastLightOpenNoticeTime == '') {
					lastLightOpenNoticeTime = new Date();
					var msg = new Message().to(id).text('環境光照不足，啟用輔助光源。').keyboard(nonKeyboard);
					bot.send(msg);
				}
				led.on();
			} else {
				if (led._pin._value == 1) {
					var msg = new Message().to(id).text('環境光照充足，關閉輔助光源。').keyboard(nonKeyboard);
					bot.send(msg);
				}
				led.off();
			}

			console.log(moistureTrans);

			if ((lastWateringTime == '' || hoursElapsed(lastWateringTime) >= 8) && moistureTrans >= 600 && moistureTrans < 1000) {
				// 澆水
				lastWateringTime = new Date();
				lastMoistureWarningTime  = new Date();
				watering();
				var msg = new Message().to(id).text('距上次澆水時間已逾 8 小時，且土壤濕度不足，啟動自動澆水 1 分鐘。').keyboard(nonKeyboard);
				bot.send(msg);

			} else if (moistureTrans >= 1000 && (hoursElapsed(lastMoistureWarningTime) >= 1 || lastMoistureWarningTime == '')) {
				lastMoistureWarningTime  = new Date();
				var msg = new Message().to(id).text('土壤濕度感測器未正確配置，請檢查。').keyboard(nonKeyboard);
				bot.send(msg);
			}

			if(lastFeedingTime == '' || hoursElapsed(lastFeedingTime) >= 12) {
				lastFeedingTime = new Date();
				
				var timer, repeatNum = 0;
			  	var repeat = function(){
			    	var time;
			    	var repeatDelay = function(time){
			      		return new Promise(function(resolve){
			        		timer = setTimeout(resolve, time);
			      		});
			    	};
			    	
			    	var repeatPromise = function(){
			      		repeatDelay(1).then(function(){
			        	servo.angle = 10;
			        	return repeatDelay(1000);
				      	}).then(function(){
			          		servo.angle = 175;
			        		return repeatDelay(1000);
					    }).then(function(){
			          		servo.angle = 10;
			        		return repeatDelay(1000);
				      	}).then(function(){
				        	if(repeatNum < 9){
				          		repeatNum = repeatNum + 1;
				          		repeatPromise();
				        	} else{
				        		repeatNum = 0;
				        		clearTimeout(timer);
				        	}
				      	});
			    	};
			    	repeatPromise();
			  	};
			  	repeat();

				var msg = new Message().to(id).text('距上次餵食時間已逾 8 小時，啟動自動餵食。').keyboard(nonKeyboard);
				bot.send(msg);
			}
		} else {
			clearInterval(runAutoMode);
			operationalMode = 'Manual';
			var msg = new Message().to(id).text('自動模式已結束，回復手動模式設置。\n您可以透過 /setmode 指令重新開啟自動模式。').keyboard(nonKeyboard);
			bot.send(msg);
			console.log('中斷自動模式！');
		}
	}

	function feedingTheFish() {
		var timer, repeatNum = 0;
	  	var repeat = function(){
	    	var time;
	    	var repeatDelay = function(time){
	      		return new Promise(function(resolve){
	        		timer = setTimeout(resolve, time);
	      		});
	    	};
	    	
	    	var repeatPromise = function(){
	      		repeatDelay(1).then(function(){
	        	servo.angle = 10;
	        	return repeatDelay(1000);
		      	}).then(function(){
	          		servo.angle = 175;
	        		return repeatDelay(1000);
			    }).then(function(){
	          		servo.angle = 10;
	        		return repeatDelay(1000);
		      	}).then(function(){
		        	if(repeatNum < 9){
		          		repeatNum = repeatNum + 1;
		          		repeatPromise();
		        	} else{
		        		repeatNum = 0;
		        		clearTimeout(timer);
		        	}
		      	});
	    	};
	    	repeatPromise();
	  	};
	  	repeat();
	}

	function watering() {
		pump.on();
		setTimeout(function(){ pump.off() }, 10000);
	}
});

board.on('error', function (err) {
	var errMsg = new Message().text('Webduino Connection has Errors!\nError Log:' + err).to(AdminID);
	bot.send(errMsg);
});


function hoursElapsed(input) {
	if(input == '')
		return false;
	var currentTime = new Date().getTime();
	var interval = currentTime - input.getTime();
	var hours   = Math.floor(interval / msecPerHour );
	return hours;
}

function minutesElapsed(input) {
	if(input == '')
		return false;
	var currentTime = new Date().getTime();
	var interval = currentTime - input.getTime();
	var minutes = Math.floor(interval / msecPerMinute );
	return(minutes);
}
