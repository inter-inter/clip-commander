inlets = 1;
outlets = 4; // 0 = commands out, 1 = scene and command display out, 2 = command display out, 3 = info

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

var thistrack;
var commands;
var active = false;

function init() {
	thistrack = new LiveAPI(triggercommand, "this_device canonical_parent");
	thistrack.property = "playing_slot_index";

	[commands, scenes] = build();

	active = true;

	log("___________________________________________________");
	log("Loaded getcommands.js:", new Date);
}

// API CALLBACKS

function triggercommand(args) {
	if (! active) return;
	var index = args[1];
	log(scenes[index]);
	outlet(1, scenes[index]); // display scene name
	if (index == -1) return;
	var command = commands[index].split(" ");
	commandout(command); // output command
	return;
}

init();

// BUILD CLIP/SCENE ARRAY

function build() {
	var commands = [];
	var scenes = [];
	var tpath = thistrack.unquotedpath;

	// get clip and scene names
	for (var i=0; i<thistrack.getcount("clip_slots"); i++) {
		var clip = new LiveAPI(tpath+" clip_slots "+i+" clip");
		// record command text
		var command = (clip.id == 0) ? "" : clip.get("name").toString();
		commands[i] = command;
		// record scene name
		var scene = getname(new LiveAPI("live_set scenes "+i));
		scenes[i] = scene;

	};

	return [commands, scenes];
};

// INPUT FUNCTIONS

function msg_int(v) {
	if (v > 0) active = true;
	else active = false;
}

function bang() {
	outlet(1, "");
	outlet(2, "");
	init();
	return;
}

function commandin(args) {
	var command = arrayfromargs(arguments).map(toLowerCaseString);
	commandout(command);
	return;
}

function update() {
	[commands, scenes] = build();
}

// COMMAND PARSING

function parsecommand(command) {
	// replace parenthetical scene names with command text
	var command = command.join(" ");
	while (true) {
		var open = command.indexOf("(");
		var close = command.indexOf(")");
		if (open == -1 || close == -1) break;
		var bracketed = (command.slice(open, close+1));
		var replacetext = "";
		var calledscenes = command.slice(open+1, close).split(" ");
		for (var k=0; k<calledscenes.length; k++) {
			var sindex = scenes.indexOf(calledscenes[k]);
			var scommand = commands[sindex];
			replacetext = replacetext+" "+ scommand;
		}
		command = command.replace(bracketed, replacetext);
	}
	command = command.split(" ");
	return command;
}

// OUTPUT FUNCTIONS

commandout.immediate = 1;

function commandout(command) {
	var command = parsecommand(command);
	outlet(2, command); // display command
	outlet(0, command); // output command
}

// CONVENIENCE FUNCTIONS

getname.immediate = 1;
toLowerCaseString.immediate = 1;

function getname(object) {
	var name = object.get("name").toString().toLowerCase().replace(".", "_").replace(/\s/g, "");
	//log(name);
	return name;
}

function toLowerCaseString(item) {
	return item.toString().toLowerCase();
}