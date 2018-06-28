inlets = 1;
outlets = 2; // 0 = ; 1 = info

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
		//outlet(1, out);
	}
	post("\n");
}

// INITIALIZATION

var s;
var thistrack;
var thistracknum;
var scenes;
var numtracks;

function init() {
	s = new LiveAPI("live_set");
	thistrack = new LiveAPI("this_device canonical_parent");
	thistracknum = parseInt(thistrack.unquotedpath.slice(-1));
	numtracks = s.getcount("tracks");

	scenes = buildscenes();

	log("___________________________________________________");
	log("Loaded fire.js:", new Date);
}

init();

// RETRIEVE INFO FROM LIVE API

// scenes
function buildscenes() {

	// scenes
	var scenes = [];
	for (var k=0; k<s.getcount("scenes"); k++) {
		var sc = new LiveAPI("live_set scenes "+k);
		var scarray = [];
		for (var l=0; l<sc.getcount("clip_slots"); l++) {
			scarray.push(new LiveAPI("live_set scenes "+k+" clip_slots "+l).id);
		};
		scenes[k] = scarray;
	};

	return scenes;
}


// INPUT FUNCTIONS

function firein(scenenum) {
	log("firein",scenenum);
	if (scenenum<0) return;
	var slots = scenes[scenenum];
	for (var i=0; i<numtracks; i++) {
		if (i==thistracknum) continue;
		var id = slots[i];
		callout(id, "fire");
	}
	outlet(1, "bang");
	return;
}

function refirein() {
	var tracknums = arrayfromargs(arguments);
	log("refirein", tracknums);
	if (tracknums == [-1]) return;
	for (i in tracknums) {
		var t = tracknums[i];
		var track = new LiveAPI("live_set tracks "+t);
		var playingslot = track.get("playing_slot_index");
		var clipid = new LiveAPI("live_set tracks "+t+" clip_slots "+playingslot).id;
		if (clipid!=0) callout(clipid, "fire");
	}
	outlet(1, "bang");
	return;
}

function stopin(val) {
	if (val==0) return;
	log("stop", val);
	callout(s.id, "stop_playing");
	callout(s.id, "stop_playing");
	callout(s.id, "stop_all_clips");
	setout(s.id, "back_to_arranger", 0);
	return;
}

// OUTPUT FUNCTIONS

function callout(id, func) {
	outlet(0, id, "call "+func);
}

function setout(id, param, value) {
	outlet(0, id, "set "+param+" "+value);
}

// CONVENIENCE

function isnum(item) {
	return (! isNaN(parseInt(item)))
}









