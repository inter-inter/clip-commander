inlets = 1;
outlets = 4; // 0 = id and messages to live.object, 1 = info to fades, 2 = info to delays, 3 = info

// LOGGING

function log() {
	var out = "";
	for(var i=0,len=arguments.length; i<len; i++) {
		var message = arguments[i];
		if(message && message.toString) {
			var s = message.toString();
			if(s.indexOf("[object ") >= 0) {
				s = JSON.stringify(message);
				}
			out = s;
		}
		else if(message === null) {
			out = "<null>";
		}
		else {
			out = message;
		}
		post(out);
		outlet(3, out);
	}
	post("\n");
}

// INITIALIZATION

var tempoapi;
var tempo;
var liveset;
var thistrack;
var activefades;

function init() {
	thistrack = new LiveAPI("this_device canonical_parent");

	tempoapi = new LiveAPI(gettempo, "live_set master_track mixer_device song_tempo");
	tempoapi.property = "value";
	
	liveset = builddict();
	activefades = [];

	log(liveset);

	log("___________________________________________________");
	log("Loaded readcommands.js:", new Date);
}

function gettempo(args) {
	var val = args[1];
	tempo = val;
}

init();

// RETRIEVE INFO FROM LIVE API

// build the set's id dictionary
function builddict() {

	var s = new LiveAPI("live_set");
	//var t = new LiveAPI("live_set master_track mixer_device song_tempo");
	
	var dict = {
		"set": s.id,
		"tempo": tempoapi.id,
		"tracks": {},
		"scenes": {},
		"cuepoints": {},
	};

	// tracks
	var mt = new LiveAPI("live_set master_track");
	dict["tracks"]["master"] = trackdict(mt, [], false, true, null);

	var rnames = []
	for (var i=0; i<s.getcount("return_tracks"); i++) {
		var r = new LiveAPI("live_set return_tracks "+i);
		var rname = getname(r).slice(1);
		dict["tracks"][rname] = trackdict(r, [], false, false, null);
		rnames.push(rname);
	};

	for (var j=0; j<s.getcount("tracks"); j++) {
		var t = new LiveAPI("live_set tracks "+j);
		var name = getname(t);
		if (t.id != thistrack.id) dict["tracks"][name] = trackdict(t, rnames, true, false, j);
	};

	// scenes
	for (var k=0; k<s.getcount("scenes"); k++) {
		var sc = new LiveAPI("live_set scenes "+k);
		var scdict = {"scene": sc.id};
		var scarray = [];
		for (var l=0; l<sc.getcount("clip_slots"); l++) {
			scarray.push(new LiveAPI("live_set scenes "+k+" clip_slots "+l).id);
		};
		scdict["slots"] = scarray;
		dict["scenes"][getname(sc)] = scdict;
	};

	// cuepoints
	var nexttime = s.get("last_event_time");
	for (var m=s.getcount("cue_points")-1; m>=0; m--) {
		var cp = new LiveAPI("live_set cue_points "+m);
		var thistime = cp.get("time");
		dict["cuepoints"][getname(cp)] = {
			"cuepoint": cp.id,
			"start": thistime,
			"end": nexttime
		};
		nexttime = thistime
	}

	return dict;
}

// helper function, build track id dictionary
function trackdict(track, returnnames, hassends, ismaster, num) {

	var t = track;
	var tpath = t.unquotedpath;
	var m = new LiveAPI(tpath+" mixer_device");
	var mpath = m.unquotedpath;

	var dict = {
		"track": t.id,
		"name": getname(t),
		"num": num,
		"sends": {},
		"devices": {},
		"db": new LiveAPI(mpath+" volume").id,
		"pan": new LiveAPI(mpath+" panning").id,
	};

	// if not the master track
	if (! ismaster) {
		// track activator
		dict["mute"] = new LiveAPI(mpath+" track_activator").id;
	};

	// if has sends
	if (hassends) {
		// send levels
		for (var i=0; i<m.getcount("sends"); i++) {
			var sname = returnnames[i]+"db";
			dict["sends"][sname] = new LiveAPI(mpath+" sends "+i).id;
		};		
	};
	
	// iterate through track devices
	for (var j=0; j<t.getcount("devices"); j++) {
		var d = new LiveAPI(tpath + " devices " + j);
		var dpath = d.unquotedpath;
		var ddict = {};
		// record ID for every device parameter
		for (var k=0; k<d.getcount("parameters"); k++) {
			var p = new LiveAPI(dpath+" parameters "+k);
			ddict[getname(p)] = p.id;
		};

		// dictionary entry for the device
		dict["devices"][getname(d)] = ddict;
	}
	return dict;
}


// HANDLE INLET MESSAGES

//setin.immediate = 1;
//getin.immediate = 1;
//delaysetin.immediate = 1;
//endfadein.immediate = 1;

function bang() {
	outlet(0, 0);
	outlet(1, "reset");
	outlet(2, "reset");
	init();
}

function setin() {
	var array = arrayfromargs(arguments).map(toLowerCaseString);
	log("setin", array);

	// reset message sends reset messages and calls init()
	if (array[0]=="reset") {
		bang()
	};

	// call set function
	set(array);
	return
}

function getin() {
	var array = arrayfromargs(arguments).map(toLowerCaseString);

	log("getin", array);

	// call get function
	get(array);
	return
}

function delaysetin() {
	var array = arrayfromargs(arguments).map(toLowerCaseString);
	log("delayset", array);
	var id = array[0];
	var value = array[1];
	var fade = array[2]==0 ? null : array[2];
	setparam(id, value, fade, null);
	return
}

function endfadein() {
	var id = arrayfromargs(arguments)[0];
	log("endfadein", id);
	var i = activefades.indexOf(id);
	log(i);
	if (i !== -1) activefades.splice(i, 1);
	log(activefades);
}

function getinfo() {
	log(liveset);
}

// READ THE SET MESSAGE

//set.immediate = 1;
//settrack.immediate = 1;
//setdevice.immediate = 1;
//setscene.immediate = 1;
//setcuepoint.immediate = 1;
//setparam.immediate = 1;


function set(msg) {	
	log("set", msg);

	var fade = null;
	var delay = null;

	while(msg.length > 0) {
		log("set while...", msg)
		var len = msg.length;

		// set fade, delay
		fade = setfade(msg, fade);
		delay = setdelay(msg, delay);
		
		// handle global messages
		switch(msg[0]) {
			case "tempo":
				msg.shift();
				var tempo = msg.shift();
				if (isnum(tempo)) setparam(liveset["tempo"], tempo, fade, delay);
				break;
			case "stop":
				msg.shift();
				stop();
				break;
			case "play":
				msg.shift();
				play();
				break;
			case "loop":
				msg.shift();
				loop();
				break;
			case "pause":
				msg.shift();
				pause();
				break;
			case "quant":
				msg.shift();
				var quant = msg.shift();
				if (isnum(quant)) setout(liveset["set"], "clip_trigger_quantization", quant);
		};

		// set track if track name/names
		var settracks = [];
		if (msg[0]=="tracks") {
			msg.shift();
			for (t in liveset["tracks"]) settracks.push(t);
		};
		while (msg.length > 0) {
			if (msg[0] in liveset["tracks"]) settracks.push(msg.shift());
			else if (msg[0].charAt(0)=="-") {
				var index = settracks.indexOf(msg[0].slice(1));
				if (index != -1) {
					msg.shift();
					settracks.splice(index, 1);
				}
				else break;
			}
			else break;
		};
		log("settracks "+settracks);
		for (i=0; i<settracks.length; i++) {
			var track = liveset["tracks"][settracks[i]];
			var tmsg = (i==settracks.length-1) ? msg : msg.slice(); // copy msg for each track until last
			settrack(track, tmsg, fade, delay);
		};

		// set scene if name of scene
		if (msg[0] in liveset["scenes"]) {
			var scene = msg.shift();
			setscene(liveset["scenes"][scene], msg);
		};

		// set cuepoint if name of cuepoint
		if (msg[0] in liveset["cuepoints"]) {
			var cuepoint = msg.shift();
			setcuepoint(liveset["cuepoints"][cuepoint]);
		};

		if (msg.length == len) msg.shift(); // ignore item if it wasn't read

	}

	setfinish();
	return
}

function settrack(track, msg, fade, delay) {
	log("settrack", track, msg, fade, delay);

	if (msg.length == 0) return;

	while (msg.length > 0) {
		log("settrack while...", msg)
		var len = msg.length;

		// set fade, delay
		fade = setfade(msg, fade);
		delay = setdelay(msg, delay);

		// handle special messages
		switch(msg[0]) {
			case "on":
				msg.shift();
				enabletrack(track, 1);
				break;
			case "off":
				msg.shift();
				enabletrack(track, 0);	
				break;
			case "db":
				msg.shift();
				var db = convertdb(msg.shift());
				if (db != null) setparam(track["db"], db, fade, delay);
				break;
			case "pan":
				msg.shift();
				var pan = convertpan(msg.shift());
				if (pan != null) setparam(track["pan"], pan, fade, delay);
				break;
			case "mute":
				msg.shift();
				setout(track["track"], "mute", 1);
				break;
			case "unmute":
				msg.shift();
				setout(track["track"], "mute", 0);
				break;
			case "arm":
				msg.shift();
				setout(track["track"], "arm", 1);
				break;
			case "disarm":
				msg.shift();
				setout(track["track"], "arm", 0);
				break;
		};
		if (msg.length == 0 || msg.length == len) return; //if done or nothing has happened, exit

		// set devices if device name/names
		var setdevices = [];
		if (msg[0]=="devices") {
			msg.shift();
			for (d in track["devices"]) setdevices.push(d);
		};
		while (msg.length > 0) {
			if (msg[0] in track["devices"]) setdevices.push(msg.shift());
			else if (msg[0].charAt(0)=="-") {
				var index = setdevices.indexOf(msg[0].slice(1));
				if (index != -1) {
					msg.shift();
					setdevices.splice(index, 1);
				}
				else break;
			}
			else break;
		};
		for (i=0; i<setdevices.length; i++) {
			var device = track["devices"][setdevices[i]];
			var dmsg = (i==setdevices.length-1) ? msg : msg.slice(); // copy msg for each device until the last
			setdevice(device, dmsg, fade, delay);
		};
		if (msg.length == 0 || msg.length == len) return; //if done or nothing has happened, exit

		// set sends if send name/names
		var setsends = [];
		if (msg[0]=="sendsdb") {
			msg.shift()
			for (s in track["sends"]) setsends.push(s);
		};
		while (msg.length > 0) {
			if (msg[0] in track["sends"]) setsends.push(msg.shift());
			else if (msg[0].charAt(0)=="-") {
				var index = setsends.indexOf(msg[0].slice(1));
				if (index != -1) {
					msg.shift();
					setsends.splice(index, 1);
				}
				else break;
			}
			else break;
		};
		if (setsends.length > 0) {
			var db = convertdb(msg.shift());
			if (db != null) {
				for (j=0; j<setsends.length; j++) {
					var sendid = track["sends"][setsends[j]];
					setparam(sendid, db, fade, delay);
				};
			};
		};
		if (msg.length == 0 || msg.length == len) return; //if done or nothing has happened, exit
	};

	return;
}


function setdevice(device, msg, fade, delay) {
	log("setdevice", device, msg, fade, delay);

	while (msg.length>0) {
		log("setdevice while...", msg)
		var len = msg.length;

		// set fade, delay
		fade = setfade(msg, fade);
		delay = setdelay(msg, delay);

		// special messages
		switch(msg[0]) {
			case "on":
				msg.shift();
				setparam(device["deviceon"], 1, fade, delay);
				break;
			case "off":
				msg.shift();
				setparam(device["deviceon"], 0, fade, delay);
				break;
		};

		// if the name of a parameter
		if(msg[0] in device) {
			var id = device[msg.shift()];
			var value = msg.shift();
			setparam(id, value, fade, delay);
		};

		if (msg.length == len) return; // if nothing has happened, exit
	};

	return;

}

function setscene(scene, msg) {
	log("setscene", scene, msg, fade, delay);

	var tofire = [];
	while (msg.length>0) {
		log("setscene while...", msg)
		var len = msg.length;

		switch(msg[0]) {
			case "fire":
				msg.shift();
				// fire all the clipslots in the array, if empty fire the scene
				if (tofire.length == 0) {
					var id = scene["scene"];
					callout(id, "fire");
				}
				else {
					for (var i=0; i<tofire.length; i++) {
						var slot = tofire[i];
						var id = scene["slots"][slot];
						callout(id, "fire");
					}
				}
				break;
		};

		// if the name of a track
		if (msg[0] in liveset["tracks"]) {
			// add to a list of clips to fire
			var track = msg.shift();
			tofire.push(liveset["tracks"][track]["num"]);
		}

		if (msg.length == len) return; //if nothing has happened, exit
	};

	return;
}

function setcuepoint(cuepoint) {
	log("setcuepoint", cuepoint);

	// set looppoints
	var length = (cuepoint["end"]-cuepoint["start"] > 0) ? cuepoint["end"]-cuepoint["start"] : 15/tempo;
	setout(liveset["set"], "loop_start", cuepoint["start"]);
	setout(liveset["set"], "loop_length", cuepoint["end"]-cuepoint["start"]);

	// jump to the point
	setout([liveset["set"], "current_song_time", cuepoint["start"]]);
	callout(cuepoint["cuepoint"], "jump");

	// play and loop messages handled in set()

	return;
}

function setparam(id, value, fade, delay) {
	log("setparam", id, value, fade, delay);

	if (delay!=null) {
		delayout(id, value, converttime(delay), fade==null ? 0 : fade);
		return;
	}

	if (fade==null) {
		setout(id, "value", value);
	}
	else {
		fadeout(id, value, converttime(fade));
	}
	return
}

// OUTPUT FUNCTIONS

//setout.immediate = 1;
//callout.immediate = 1;
//setfinish.immediate = 1;

function setout(id, param, value) {
	outlet(0, id, "set "+param+" "+value);
}

function callout(id, func) {
	outlet(0, id, "call "+func)
}

function fadeout(id, value, time) {
	if (activefades.indexOf(parseInt(id)) != -1) return;
	outlet(1, id, value, time);
	activefades.push(parseInt(id));
	log(activefades);
}

function delayout(id, value, time, fadetime) {
	outlet(2, id, value, time, fadetime);
}

function setfinish() {
	log("setfinish");
	outlet(3, "bang")
}


// HELPER FUNCTIONS TO SET FADE, DELAY

//setfade.immediate = 1;
//setdelay.immediate = 1;

function setfade(msg, fade) {
	if (msg[0]=="fade") {
		if (converttime(msg[1])==false) {
			msg.shift();
		} else {
			fade = msg[1];
			msg.shift();
			msg.shift();
		};
	}
	return fade;
}

function setdelay(msg, delay) {
	if (msg[0]=="del" || msg[0]=="delay") {
		if (converttime(msg[1])==false) {
			msg.shift();
		} else {
			delay = msg[1];
			msg.shift();
			msg.shift();
		}
	};
	return delay;
}

// CONVENIENCE FUNCTIONS

//enabletrack.immediate = 1;
//stop.immediate = 1;
//play.immediate = 1;
//loop.immediate = 1;
//pause.immediate = 1;

function enabletrack(track, tog) {
	if (track["name"] != "master") setout(track["track"], "mute", 1-tog);
	for(d in track["devices"]) {
		setparam(track["devices"][d]["deviceon"], tog);
	};
	return;
}

function stop() {
	callout(liveset["set"], "stop_playing");
	callout(liveset["set"], "stop_playing");
	callout(liveset["set"], "stop_all_clips");
	return
}

function play() {
	callout(liveset["set"], "start_playing");
	setout(liveset["set"], "loop", 0);
	return;
}

function loop() {
	callout(liveset["set"], "start_playing");
	setout(liveset["set"], "loop", 1);
	return;
}

function pause() {
	callout(liveset["set"], "stop_playing");
	return;
}

// VALUE CONVERSIONS

//toLowerCaseString.immediate = 1;
//converttime.immediate = 1;
//convertdb.immediate = 1;
//getname.immediate = 1;
//isnum.immediate = 1;

function toLowerCaseString(item) {
	return item.toString().toLowerCase();
}

function converttime(time) {
	time = time.toString();
	if (! isnum(time)) return null;
	
	if (time.slice(-1)=="q") {
		var numq = parseInt(time.slice(0, -1));
		if (isNaN(numq)) return null;	
		var qms = 60000/tempo; // 1 quarter note in milliseconds
		return numq*qms;
	};
	time = parseInt(time)*1000;
	// fade or delay cannot be less than 100 ms
	if (time>100) {
		return time;
	} else {
		return null;
	};
}

function convertdb(db) {
	if (db.toString()=="-inf") return 0;
	if (! isnum(db)) return null;
	return 2.07201247*(db*db)/10000 + 2.57503387*(db)/100 + 8.342259079/10;
}

function convertpan(pan) {
	if (isnum(pan)) return parseInt(pan)/50;
	return null
}

function getname(object) {
	var name = object.get("name").toString().toLowerCase().replace(/\W/g, "").replace(/\s/g, "");
	//log(name);
	return name;
}

function isnum(item) {
	return (! isNaN(parseInt(item)))
}









