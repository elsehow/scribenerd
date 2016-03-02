var Kefir = require('kefir')
, _ = require('lodash')
, indraURI = 'http://indra.webfactional.com'
, client = require('request-json').createClient(indraURI)
, appEventString = 'scribenerd' // we use this event name for pub-sub
, EventEmitter = require('events').EventEmitter
, dispatcher = new EventEmitter()

console.log('starting')


//  1  voice rec

// returns a stream of recognition events
function recognitionS () {
  // setup a recognition engine
  var recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  // return the stream of recognition results
  return resultS = Kefir.stream(emitter => {
      recognition.onresult = (event) => emitter.emit(event)
      // and start the recognition
      recognition.start();
  })
  // wacky hacks to produce a stream of recognition transcripts
  .map(r => r.results)
  .map(_.last)
}

function transcriptS (s) {
    return s.map(r => r[0].transcript).skipDuplicates()
}

function finalTranscriptS (op, lastRecs) {
    var finals = lastRecs.filter(r => r.isFinal == op)
    return transcriptS(finals)
}

function socketTranscriptS () {
    var socket = require('socket.io-client')(indraURI)
    return Kefir.fromEvents(socket, appEventString)
}

// post transcript events to server
function post (name, trans) {
    client.post('/', {
        type: appEventString,
        name: name,
        said: trans,
    }, (err, res) => {
        if (err)
            dispatcher.emit('error', err)
        return
    })
}



// 2  rendering the state

// global mutable state
var store = {
    name: undefined,
    conversation: [],
    inputVal:'',
    inProgress: '',
}

var h = require('virtual-dom/h')
var main = require('main-loop')
var loop = main(store, render, require('virtual-dom'))
document.querySelector('#app').appendChild(loop.target)

function render (state) {
    // if we've given ourself a name
    if (state.name) {
        // we show the transcript view
        var s = _.sortBy(state.conversation, 'receivedAt')
        return h('div', [
            h('h1', `transcript (you are ${state.name})`),
            s.map(t => h('p', `${t.name}: ${t.said}`)),
            h('small', state.inProgress),
        ])
    // otherwise,
    } else {
        // collect name + assure we get microphone access
        return h('div', [
            h('h1', 'need stuff from ya'),
            h('input', {
                placeholder: 'your name',
                onkeyup:      inputKeyup,
            }),
            h('button', {
                disabled:     !state.inputVal,
                onclick:      submit,
            }, 'join')
        ])
    }
}


// 3  updating the state

function inputKeyup (ev) {
    var val = ev.target.value
    store.inputVal = val
    loop.update(store)
}

function setConversation (t) {
    store.conversation.push(t)
    loop.update(store)
}

function setInProgress (t) {
    store.inProgress = t
    loop.update(store)
}


function submit () {
   // save my name, save my name...
   store.name = store.inputVal
    // start recognitions stream
    var recS = recognitionS()
    // final transcripts
    var finals = finalTranscriptS(true, recS)
    // in-progress transcripts
    var inprog = finalTranscriptS(false, recS)
    // start to post final transcripts to server, with my name attached
    var p = _.partial(post, store.name)
    finals.onValue(p)
    // start displaying in-progress recognitions
    // but remove then wen we see a final one
    finalTranscriptS(false, recS).onValue(setInProgress)
    // done
    loop.update(store)
}

// TODO actually 'join' and view the transcript page
// TODO display interim values?

// turn transcription events from server into a log of all transcripts
socketTranscriptS()
    .onValue(setConversation)




// TODO indicate whether or not we have the proper permissions
// TODO assure socket connected, audio accessed, name chosen
// TODO handle all errors from everywhere
