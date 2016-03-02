var Kefir = require('kefir')
, _ = require('lodash')
, h = require('virtual-dom/h')
, main = require('main-loop')
, EventEmitter = require('events').EventEmitter
, dispatcher = new EventEmitter()
, indraURI = 'http://indra.webfactional.com'
, client = require('request-json').createClient(indraURI)
, appEventString = 'scribenerd' // we use this event name for pub-sub


console.log('booting')
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
      recognition.onend = () => {
          console.log('would have stopped, will try to restart now')
          recognition.start()   
      }
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

function finalTranscriptS (lastRecs) {
    var finals = lastRecs.filter(r => r.isFinal)
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

var loop = main(store, render, require('virtual-dom'))
var d = document.getElementById('app')//.appendChild(loop.target)
document.querySelector('#app').appendChild(loop.target)

function render (state) {

  if (state.name)
    return transcriptV()
  else
    return signupV()

  // view for a signup
  function signupV () {
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

  // view for the transcript
  function transcriptV () {

    var s = _.sortBy(state.conversation, 'receivedAt')

      console.log(s)

    return h('div', { style: {
        'font-family': 'sans-serif',
        'padding': '3%',
      }},[
          h('a', {href: 'https://github.com/elsehow/scribenerd'}, 'source'),
        headerV(),
        s.map(chatLine),
        inProgressV(),
    ])

    // a single chat
    function chatLine (m) {
      return h('div', [
             h('span', {style: {'font-weight': 'bold'}}, `${m.name}: `),
             h('span', m.said)
      ])
    }
    // the recognition currently in progress
    function inProgressV () {
      return h('small', { style: {'color': 'lightgray'}}, state.inProgress)
    }
    // the header (tells you your name)
    function headerV () {
      return h('h1', `transcript (you are ${state.name})`)
    }
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

function speak (t) {
    var msg = new SpeechSynthesisUtterance(t)
    msg.lang = 'en-GB';
    window.speechSynthesis.speak(msg); 
}


function submit () {
   // save my name, save my name...
   store.name = store.inputVal
    // start recognitions stream
    var recS = recognitionS()
    // final transcripts
    var finals = finalTranscriptS(recS)
    // start to post final transcripts to server, with my name attached
    var p = _.partial(post, store.name)
    finals.onValue(p)
    // start displaying in-progress recognitions
    // but remove then wen we see a final one
    transcriptS(recS).onValue(setInProgress)
    // done
    loop.update(store)
}



// entrypoint
socketTranscriptS()
    .onValue(setConversation)
socketTranscriptS()
    .map(t => t.said)
    .onValue(speak)

// TODO inline + minify all
console.log('booted :)')
