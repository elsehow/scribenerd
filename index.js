var Kefir = require('kefir')
, _ = require('lodash')
, indraURI = 'http://indra.webfactional.com'
, client = require('request-json').createClient(indraURI)

console.log('starting')

// returns a stream of recognition events
function recognitionS () {
  // setup a recognition engine
  var recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  // return the stream of recognition results
  return resultS = Kefir.stream(emitter => {
      // set recognition's onresult fn
      recognition.onresult = event => emitter.emit(event)
      // and start the recognition
      recognition.start();
  })
}

// returns a stream of transcripts spoken by the user
function recognitionTranscriptS () {
  return recognitionS()
    // wacky hacks to produce a stream of recognition transcripts
    // each of which has been deemed "final" by the webkit API
    .map(r => r.results)
    .map(r => _.filter(r, r => r.isFinal))
    .map(_.last)
    .filter(_.isObject)
    .map(r => r[0].transcript)
    .skipDuplicates()
}

function socketTranscriptS () {
    var socket = require('socket.io-client')(indraURI)
    return Kefir.fromEvents(socket, 'scribenerd')
}

// post transcript events to server
function post (t) {
    client.post('/', {
        type: 'scribenerd',
        transcript: t,
    })
}

// post recognition events to server
recognitionTranscriptS().onValue(post)
// subscribe to transcript events from server
socketTranscriptS().log()//onValue(setHTMLOf($transcript))
// TODO assure socket connected, audio accessed, name chosen
//
// handle all errors from everywhere
//
//    Kefir.merge([stream, socketTranscriptS, userlistS]) .onError(setErrorMessage)
//

// set up dom stuff
var vdom   = require('virtual-dom')
, hyperx   = require('hyperx')
, hx       = hyperx(vdom.h)
, main     = require('main-loop')
, loop     = main({ times: 0 }, render, vdom)
document.querySelector('#app').appendChild(loop.target)

function render (state) {
    return hx`<div>
        <h1>clicked ${state.times} times</h1>
        <button onclick=${onclick}>click me!</button>
        </div>`

    function onclick () {
        loop.update({ times: state.times + 1 })
    }
}

console.log('run')
