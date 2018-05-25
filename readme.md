# ClipCommander

## Introduction

ClipCommander is a Max for Live device that uses Javascript access to the Live API to allow clip-based command triggering of parameters in Ableton Live.

To install, copy the ClipCommander folder into User Library>Presets>MIDI Effects>Max MIDI Effect, or into the project folder of the Live Set you will be using.

To begin, drag ClipCommander into an empty MIDI track.

The basic functionality of ClipCommander is available using the text box. Simply type a message into the box and click "GO" or type enter to trigger:

```
master db -20 // set the master track to -20 dB
fade 5 tracks pan -50 // pan all tracks left with a 5 second fade
trackone compressor on // turn the named "compressor" in the track named "trackone" on
play // start the Live transport
tempo 120 // set the tempo to 120 BPM
```

ClipCommander also interprets the name field in each of its clips as a command. When a clip plays the command is triggered. Using this functionality, a command can be associated with a scene in the Live Set, allowing one to set and recall values in coordination with the scene launcher.

To reduce redundancy, commands can also be recalled indirectly by using the name of the scene they reside in in parentheses. For example, name the first scene of the Live Set "1" and then place a MIDI clip in that scene (in the track housing Clip Commander) with the text "tracks off". Now type in the text box:

```
(1) tempo 78
```

ClipCommander interprets the text in parentheses as an indirect call to the command held in that scene's clip, unpacking the full message "tracks off tempo 78", which turns all tracks off and sets the tempo to 78 BPM. These parenthetical calls can also be used within clip text itself. You may include as many scene names within the parenthetical as you like, and the parenthetical can occur anywhere in the command.

On load, ClipCommander accummulates a dictionary of all accessible parameters in the Live Set and their respective ID's. ID's follow objects, so if tracks/devices are reordered, they will continue to be accessible. However, if new tracks/devices/parameters are added, the ClipCommander will need to be updated before these are accessible.

### Message Syntax

All messages are case insensitive. If a track/device is named with capital letters, they are converted. Non alphanumeric characters and spaces are automatically removed from track/device names when interpreted by ClipCommander.

ClipCommander will continue parsing the message to its end, ignoring any words it is not able to interpret. When track/scene/device names are encountered, the message will trace through the Live Object Model as directed. So

```
trackone deviceone parameterone 30
```

will find a parameter named "parameterone" in a device named "deviceone" in a track named "trackone" and set it to 30.

To set sendlevels, use the name of that return track + "db".

```
trackone verbdb -20
```

This will set the send level of "trackone" to the return track named "verb" to -20 dB.

Multiple track/send/device names can be used to apply the command to multiple objects at once. You can also use the keywords "tracks" "sendsdb" and "devices" to set all the tracks, sends and devices at once, and the names of individual objects prepended by "-" to exclude those from the list.

```
trackone tracktwo pan -20 // pan "trackone" and "tracktwo"
tracks -master fade 1 db -inf // fade out all tracks except the master
trackone sendsdb -20 // set all "trackone" sends to -20 dB
```

#### Fades and Delays

Fades and delays can be included in messages. For example,

```
trackone db -20 fade 3 pan -50 delay 2 tracktwo db -20 fade 4 pan 50
```

will set the volume of the track named "trackone" to -20 dB immediately and pan it to the left with a fade time of three seconds. After a delay of two seconds, track two will be set to -20 dB and fade to the right over four seconds (*following* the two-second delay).

Fades and delays set within track/device message segments are local, and do not effect the global delay/fade time. So the message

```
delay 1 trackone delay 2 db 0 deviceone delay 3 paramone 0 tracktwo db 0
```

is interpreted as [ delay 1 trackone [ delay 2 db 0 deviceone [ delay 3 paramone 0 ] ] tracktwo db 0], and is equivalent to

```
delay 1 tracktwo db 0 delay 2 trackone db 0 delay 3 trackone deviceone paramone 0
```

If multiple delay times or fade times are set in the same message, they are not additive. A single delay is applied to each set parameter  at the moment the message is triggered. However, if a parameter is set with both a fade and delay time, the delay will be applied first, and then the fade will be triggered. So

```
delay 1 fade 1 trackone verbdb 0
```

means fade the "verb" send level of "trackone" to 0 dB over one second *after* a one second delay.

The letter "q" following a number is short for "quarter notes", and can be used to set fade and delay times relative to the set's current tempo.

```
fade 4q master db 0
```

fades the master track's volume to 0 dB over four quarter notes.

### Message Definitions

Here is a full list of messages and the actions they define. When naming tracks and devices, it be sure not to conflict with names used by ClipCommander to define messages.

#### Global Messages

| Message         | Result                                                       |
| --------------- | ------------------------------------------------------------ |
| play            | Start the transport (loop mode off).                         |
| loop            | Start the transport (loop mode on).                          |
| stop            | Stop the transport, reset playhead and stop all playing clips. |
| pause           | Stop the transport (playhead keeps current position).        |
| tempo           | Set the tempo.                                               |
| quant           | Set quantization. 0: None   1: 8 Bars   2: 4 Bars   3: 2 Bars   4: 1 Bar   5: 1/2   6: 1/2T   7: 1/4   8: 1/4T   9: 1/8   10: 1/8T   11: 1/16   12: 1/16T   13: 1/32 |
| tracks          | Send a message to all tracks.                                |
| [track name]    | Send a message to a track by name ("master" always means the master track). |
| -[track name]   | Exclude a track from the following message.                  |
| [scene name]    | Send a message to a scene.                                   |
| [cuepoint name] | Jump to the specified cuepoint. This message also sets the arrange mode's loop markers to start at this and end at the next cuepoint, or the end of the song. |

#### Track Messages

| Message        | Result                                                      |
| -------------- | ----------------------------------------------------------- |
| on             | Enable the track. (Unmute and activate all devices.)        |
| off            | Disable the track. (Mute and disable all devices).          |
| mute           | Mute the track.                                             |
| unmute         | Unmute the track.                                           |
| arm            | Record-enable the track.                                    |
| disarm         | Record-enable off.                                          |
| db             | Set the volume in decibels.                                 |
| pan            | Set the panning (-50 … 50)                                  |
| devices        | Send a message to all devices.                              |
| [device name]  | Send a message to a specific device.                        |
| -[device name] | Exclude device from the current message.                    |
| sendsdb        | Set all send levels (in decibels)                           |
| [sendname]db   | Set the send level for to a return track with a given name. |
| -[sendname]db  | Exclude a return track from the set message.                |

#### Device Messages

| Message          | Result                         |
| ---------------- | ------------------------------ |
| on               | Enable the device.             |
| off              | Disable the device.            |
| [parameter name] | Set a parameter value by name. |

#### Scene Messages

| Message                    | Result                                                       |
| -------------------------- | ------------------------------------------------------------ |
| [list of track names] fire | Fire this scene's clip slots in the specified tracks. If no list is given, all clip slots will fire. |



## TO DO/Wish list

- [ ] Currently you must click "Update Clips" in order for ClipCommander to reflect changes to the clip-based cuelist. It would be ideal if the clip list would just update automatically every time a clip name is changed (I've tried to do this using callback functions in the Javascript and it's very clunky). The alternative to this would be for the function in to grab information from the actual live objects rather than pulling from the arrays stored in global variables - eliminating the need to update. But this could get slow with very large sets.
- [ ] It would also be ideal if the ID dictionary would automatically update every time the Live set is saved. I haven't been able to figure out how to get a "bang" in Max for Live when the Live Set is saved.
- [ ] Extend this tool to receive/send OSC messages (If used with other applications, a set of two ClipCommanders could be used, one to control Live and another to send messages to another application like SuperCollider/TouchDesigner. This would require a toggle for "Live Control" and an interface to set OSC ports/addresses to send/receive).
- [ ] More terminal-like functionality in the text box, ideally storing past messages in a text file so they can be recalled using the up/down-arrow, maybe an autofill feature (but perhaps this is overkill… better to just implement OSC so commands can be fired from an external command-line application)
- [ ] Support for a "get" command similar to the "set" command which reports the current value of parameter/parameters. This would be important if integrating with more sophisticated GUIs in other applications.
- [ ] Being able to set multiple parameters in a device to a single value using a list of parameters. (Logically it should be able to do this, I just didn't get around to it).
- [ ] Better decibel conversion function. (The one I'm using now is a polynomial approximation I found online, because I didn't want to get into Javascript computing exponentials).
- [ ] I've noticed that it sometimes trips up when trying to set/fade multiple parameters in multiple tracks at the same time… Need to do lots more real-world-situation testing and stress testing to determine the actual reliability of this tool. … I imagine I will probably use the fade/delay feature of this sparsely and opt for clip automation instead when I can. The really nice thing about it is that it fades *from the current value* whatever it is, so you can fade values that have been handled manually without glitches.
- [ ] Recolor clips when fired! (To make the cuelist pretty).
- [ ] Disable muted clips in the clip list
- [ ] OSC-based logging