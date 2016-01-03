var Settings = require('./secrets.json');

const AdminID = Settings.Telegram.AdminID;

// 
var Bot = require('telegram-api');

// require message types needed
var Message  = require('telegram-api/types/Message');
var Question = require('telegram-api/types/Question');
var Keyboard = require('telegram-api/types/Keyboard');

const nonKeyboard = new Keyboard().keys([]).hide();
console.log(nonKeyboard);

var Webduino = require('webduino-js');

var bot = new Bot({
  token: Settings.Telegram.Token
});

const questionLight = new Question({
  text: 'What should I do with the light?',
  answers: [['Toggle LED 燈'], ['閃爍 LED 燈'], ['開燈', '關燈'], ['檢查 LED 狀態']]
});

const questionStatus = new Question({
	text: 'What status do you want to check?',
	answers: [['全部狀態'], ['植物狀態'], ['抽水狀態'], ['LED 燈狀態'], ['餵食狀況'], ['現行模式']]
});

const board = new Webduino.WebArduino(Settings.Webduino.DeviceID);


board.on('ready', function() {
	board.samplingInterval = 500;
	const led  = new Webduino.module.Led(board, board.getDigitalPin(Settings.Webduino.Led.DigitalPin));  
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

  bot.start().catch(function(err) {
		console.error(err, '\n', err.stack);
	});

	bot.on('update', function(update) {
		console.log('Polled\n', update);
	});

	bot.command('light', function(message) {
	  const id = message.chat.id;
	  console.log(message.chat);

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
	});

	const questionServo = new Question({
	  text: 'What should I do with the servo?',
	  answers: [['旋轉魚飼料瓶']]
	});

	bot.command('servo', function(message) {
		const id = message.chat.id;
	  console.log(message.chat);

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
	});

	bot.command('status', function(message) {
		const id = message.chat.id;
	  console.log(message.chat);

	  questionStatus.to(message.chat.id).reply(message.message_id);
	  bot.send(questionStatus).then(function(answer) {
	  	var msg = new Message().to(id).text('您想要檢查的狀態: ' + answer.text).keyboard(nonKeyboard);
	    bot.send(msg);
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

	    	case "抽水狀態":

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

	    		break;

	    	case "現行模式":

	    		break;
	    }
	  });
	});

});

board.on('error', function (err) {
	var errMsg = new Message().text('Webduino Connection has Errors!\nError Log:' + err).to(AdminID);
	bot.send(errMsg);
});