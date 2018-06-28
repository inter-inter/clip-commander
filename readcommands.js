inlets = 1;
outlets = 5; // 0 = id and messages to live.object, 1 = info to fades, 2 = info to delays, 3 = refire/restore messages, 4 = info

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
		//outlet(4, out);
	}
	post("\n");
}

// INITIALIZATION

var s;
var tempoapi;
var tempo;
var liveset;
var thistrack;
var activefades;
var blank;
var refire;
//var stop;

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

	s = new LiveAPI("live_set");
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
		//if (rname[0]==".") continue; //if flagged as omitted, pass
		dict["tracks"][rname] = trackdict(r, [], false, false, null);
		rnames.push(rname);
	};

	for (var j=0; j<s.getcount("tracks"); j++) {
		var t = new LiveAPI("live_set tracks "+j);
		var name = getname(t);
		if (name==false) continue; // if flagged as omitted, pass
		if (t.id != thistrack.id) dict["tracks"][name] = trackdict(t, rnames, true, false, j);
	};

	// cuepoints
	var cuepoints = {};
	var cuetimes = [];
	for (var m=0; m<s.getcount("cue_points"); m++) {
		var cp = new LiveAPI("live_set cue_points "+m);
		var start = parseFloat(cp.get("time"));
		cuepoints[getname(cp)] = {
			"cuepoint": cp.id,
			"start": start
		};
		cuetimes.push(start);
	};
	cuetimes = cuetimes.sort(function (a, b) { return a-b; });

	for (cuepoint in cuepoints) {
		var start = cuepoints[cuepoint]["start"];
		var endindex = cuetimes.indexOf(start)+1;
		var end = (endindex == cuetimes.length) ? s.get("last_event_time") : cuetimes[endindex];
		cuepoints[cuepoint]["end"] = end;
	};


	dict["cuepoints"] = cuepoints;

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
		var dname = getname(d);
		if (dname==false) continue; // if flagged as omitted, pass
		var dpath = d.unquotedpath;
		var ddict = {};
		// record ID for every device parameter
		for (var k=0; k<9; k++) { // only the first 9 parameters are logged, to save time
			var p = new LiveAPI(dpath+" parameters "+k);
			var pname = getname(p);
			if (pname==false) continue; // if flagged as omitted, pass
			ddict[pname] = p.id;
		};

		// dictionary entry for the device
		dict["devices"][dname] = ddict;
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


function set(msg) {	
	log("set", msg);

	var fade = null;
	var delay = null;
	refire = -1;
	blank = false;
	//stop = false;

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
			// case "stop":
			// 	msg.shift();
			// 	blank = true;
			// 	stop = true;
			// 	break;
			case "play":
				msg.shift();
				play();
				break;
			case "loop":
				msg.shift();
				loop(1);
				break;
			case "unloop":
				msg.shift();
				loop(0);
				break;
			case "quant":
				msg.shift();
				var quant = msg.shift();
				if (isnum(quant)) setout(liveset["set"], "clip_trigger_quantization", quant);
				break;
			case "clickon":
				msg.shift();
				setout(liveset["set"], "metronome", 1);
				break;
			case "clickoff":
				msg.shift();
				setout(liveset["set"], "metronome", 0);
				break;
			case "blank":
				msg.shift();
				blank = true;
				break;
			case "restore":
				msg.shift();
				outlet(3, "restore");
				break;
		};

		// set track if name of track
		if (msg[0] in liveset["tracks"]) {
			var track = msg.shift();
			settrack(liveset["tracks"][track], msg, fade, delay);
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
			case "refire":
				msg.shift();
				if (refire == -1) refire = [];
				refire.push(parseInt(track["num"]));
		};
		if (msg.length == 0) return;
		//if (msg.length == 0 || msg.length == len) return; //if done or nothing has happened, exit

		// if it is a device
		if (msg[0] in track["devices"]) setdevice(track["devices"][msg.shift()], msg, fade, delay);

		// if it is a send level (sendnamedb)
		if (msg[0] in track["sends"]) {
			var name = msg.shift();
			var db = convertsend(msg.shift());
			if (db != null) setparam(track["sends"][name], db, fade, delay);
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


function setcuepoint(cuepoint) {
	log("setcuepoint", cuepoint);

	// set looppoints
	var length = (cuepoint["end"]-cuepoint["start"] > 0) ? cuepoint["end"]-cuepoint["start"] : 15/tempo;
	setout(liveset["set"], "loop_start", cuepoint["start"]);
	setout(liveset["set"], "loop_length", cuepoint["end"]-cuepoint["start"]);

	// jump to the point
	setout([liveset["set"], "current_song_time", cuepoint["start"]]);
	//setout(liveset["set"], "back_to_arranger", 0);
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
}

function delayout(id, value, time, fadetime) {
	outlet(2, id, value, time, fadetime);
}

function setfinish() {
	log("setfinish");
	outlet(3, "refire", refire);
	if (! blank) outlet(3, "fire");
	//outlet(3, "stop", (stop) ? 1 : 0);
	return;
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

function play() {
	callout(liveset["set"], "start_playing");
	//setout(liveset["set"], "loop", 0);
	return;
}

function loop(bool) {
	//callout(liveset["set"], "start_playing");
	setout(liveset["set"], "loop", bool);
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

// function convertdb(db) {
// 	if (db.toString()=="-inf") return 0;
// 	if (! isnum(db)) return null;
// 	//return 2.07201247*(db*db)/10000 + 2.57503387*(db)/100 + 8.342259079/10;
// 	return 2.027132923*(db*db*db)/1000000 + 3.987653083*(db*db)/10000 + 3.002900816*(db)/100 + 8.422843694/10;
// 	//return 10 * Math.log(db/1.995262)/Math.log(10);
// 	//return 1.995262 * Math.pow(10, db/10);
// }

function convertdb(db) {
	if (db in dbtovol) return dbtovol[db];
	return null;
}

function convertsend(db) {
	if (db in dbtosend) return dbtosend[db];
	return null;
}

function convertpan(pan) {
	if (isnum(pan)) return parseInt(pan)/50;
	return null
}

function getname(object) {
	var name = object.get("name").toString();
	if (name[0]==".") {
		return false;
	}
	name = name.toLowerCase().replace(/\W/g, "").replace(/\s/g, "");
	return name;
}

function isnum(item) {
	return (! isNaN(parseInt(item)))
}

var dbtovol = {
	"-inf": 0,
	"-69": 0.002376,
	"-68": 0.005042,
	"-67": 0.008033,
	"-66": 0.011130,
	"-65": 0.014195,
	"-64": 0.017634,
	"-63": 0.021346,
	"-62": 0.025248,
	"-61": 0.029627,
	"-60": 0.034624,
	"-59": 0.040196,
	"-58": 0.045391,
	"-57": 0.051012,
	"-56": 0.056434,
	"-55": 0.062098,
	"-54": 0.067786,
	"-53": 0.073492,
	"-52": 0.079490,
	"-51": 0.085236,
	"-50": 0.091348,
	"-49": 0.097384,
	"-48": 0.103536,
	"-47": 0.110000,
	"-46": 0.116202,
	"-45": 0.122717,
	"-44": 0.129429,
	"-43": 0.136015,
	"-42": 0.142882,
	"-41": 0.150000,
	"-40": 0.156977,
	"-39": 0.164219,
	"-38": 0.171707,
	"-37": 0.179350,
	"-36": 0.187037,
	"-35": 0.194983,
	"-34": 0.203181,
	"-33": 0.211630,
	"-32": 0.220335,
	"-31": 0.229242,
	"-30": 0.238439,
	"-29": 0.247983,
	"-28": 0.257907,
	"-27": 0.268256,
	"-26": 0.279088,
	"-25": 0.290455,
	"-24": 0.302414,
	"-23": 0.315154,
	"-22": 0.328847,
	"-21": 0.343664,
	"-20": 0.360000,
	"-19": 0.378422,
	"-18": 0.400000,
	"-17": 0.424942,
	"-16": 0.450000,
	"-15": 0.474942,
	"-14": 0.500000,
	"-13": 0.524942,
	"-12": 0.550000,
	"-11": 0.574942,
	"-10": 0.600000,
	"-9": 0.624942,
	"-8": 0.650000,
	"-7": 0.674942,
	"-6": 0.700000,
	"-5": 0.724942,
	"-4": 0.750000,
	"-3": 0.774942,
	"-2": 0.800000,
	"-1": 0.824942,
	"0": 0.850000,
	"1": 0.874942,
	"2": 0.900000,
	"3": 0.924942,
	"4": 0.950000,
	"5": 0.974942,
	"6": 1.000000
};

var dbtosend = {
	"-inf": 0,
	"-69": 0.013756,
	"-68": 0.022411,
	"-67": 0.029405,
	"-66": 0.034624,
	"-65": 0.040196,
	"-64": 0.045391,
	"-63": 0.051012,
	"-62": 0.056434,
	"-61": 0.062098,
	"-60": 0.067786,
	"-59": 0.073492,
	"-58": 0.07949,
	"-57": 0.085236,
	"-56": 0.091348,
	"-55": 0.097384,
	"-54": 0.103536,
	"-53": 0.11,
	"-52": 0.116202,
	"-51": 0.122717,
	"-50": 0.129429,
	"-49": 0.136015,
	"-48": 0.142882,
	"-47": 0.15,
	"-46": 0.156977,
	"-45": 0.164219,
	"-44": 0.171707,
	"-43": 0.17935,
	"-42": 0.187037,
	"-41": 0.194983,
	"-40": 0.203181,
	"-39": 0.21163,
	"-38": 0.220335,
	"-37": 0.229242,
	"-36": 0.238439,
	"-35": 0.247983,
	"-34": 0.257907,
	"-33": 0.268256,
	"-32": 0.279088,
	"-31": 0.290454,
	"-30": 0.302414,
	"-29": 0.315154,
	"-28": 0.328847,
	"-27": 0.343664,
	"-26": 0.36,
	"-25": 0.378422,
	"-24": 0.4,
	"-23": 0.424942,
	"-22": 0.45,
	"-21": 0.474942,
	"-20": 0.5,
	"-19": 0.524942,
	"-18": 0.55,
	"-17": 0.574942,
	"-16": 0.6,
	"-15": 0.624942,
	"-14": 0.65,
	"-13": 0.674942,
	"-12": 0.7,
	"-11": 0.724942,
	"-10": 0.75,
	"-9": 0.774942,
	"-8": 0.8,
	"-7": 0.824942,
	"-6": 0.85,
	"-5": 0.874942,
	"-4": 0.9,
	"-3": 0.924942,
	"-2": 0.95,
	"-1": 0.974942,
	"0": 1
}

// raw send data (coll) from live observer

// 1, 0.013756
// 2, 0.022411
// 3, 0.029405
// 4, 0.034624
// 5, 0.040196
// 6, 0.045391
// 7, 0.051012
// 8, 0.056434
// 9, 0.062098
// 10, 0.067786;
// 11, 0.073492;
// 12, 0.07949;
// 13, 0.085236;
// 14, 0.091348;
// 15, 0.097384;
// 16, 0.103536;
// 17, 0.11;
// 18, 0.116202;
// 19, 0.122717;
// 20, 0.129429;
// 21, 0.136015;
// 22, 0.142882;
// 23, 0.15;
// 24, 0.156977;
// 25, 0.164219;
// 26, 0.171707;
// 27, 0.17935;
// 28, 0.187037;
// 29, 0.194983;
// 30, 0.203181;
// 31, 0.21163;
// 32, 0.220335;
// 33, 0.229242;
// 34, 0.238439;
// 35, 0.247983;
// 36, 0.257907;
// 37, 0.268256;
// 38, 0.279088;
// 39, 0.290454;
// 40, 0.302414;
// 41, 0.315154;
// 42, 0.328847;
// 43, 0.343664;
// 44, 0.36;
// 45, 0.378422;
// 46, 0.4;
// 47, 0.424942;
// 48, 0.45;
// 49, 0.474942;
// 50, 0.5;
// 51, 0.524942;
// 52, 0.55;
// 53, 0.574942;
// 54, 0.6;
// 55, 0.624942;
// 56, 0.65;
// 57, 0.674942;
// 58, 0.7;
// 59, 0.724942;
// 60, 0.75;
// 61, 0.774942;
// 62, 0.8;
// 63, 0.824942;
// 64, 0.85;
// 65, 0.874942;
// 66, 0.9;
// 67, 0.924942;
// 68, 0.95;
// 69, 0.974942;
// 70, 1.;





