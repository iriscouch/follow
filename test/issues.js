var tap = require('tap')
  , test = tap.test
  , util = require('util')
  , request = require('request')
  , traceback = require('traceback')

var lib = require('../lib')
  , follow = require('../api')
  , DB = process.env.db || 'http://localhost:5984/follow_test'

test('Issue #8', function(t) {
  var timeouts = timeout_tracker()

  // Detect inappropriate timeouts after the run.
  var runs = {'set':false, 'clear':false}
  function badSetT() {
    runs.set = true
    return setTimeout.apply(this, arguments)
  }

  function badClearT() {
    runs.clear = true
    return clearTimeout.apply(this, arguments)
  }

  follow(DB, function(er, change) {
    t.false(er, 'Got a feed')
    t.equal(change.seq, 1, 'Handler only runs for one change')

    this.on('stop', check_timeouts)
    this.stop()

    function check_timeouts() {
      t.equal(timeouts().length, 0, 'No timeouts by the time stop fires')

      lib.timeouts(badSetT, badClearT)

      // And give it a moment to try something bad.
      setTimeout(final_timeout_check, 250)
      function final_timeout_check() {
        t.equal(timeouts().length, 0, 'No lingering timeouts after teardown: ' + tims(timeouts()))
        t.false(runs.set, 'No more setTimeouts ran')
        t.false(runs.clear, 'No more clearTimeouts ran')

        t.end()
      }
    }
  })
})

test('Issue #9', function(t) {
  var timeouts = timeout_tracker()

  follow({db:DB, inactivity_ms:30000}, function(er, change) {
    if(change.seq == 1)
      return // Let it run through once, just for fun.

    t.equal(change.seq, 2, 'The second change will be the last')
    this.stop()

    setTimeout(check_inactivity_timer, 250)
    function check_inactivity_timer() {
      t.equal(timeouts().length, 0, 'No lingering timeouts after teardown: ' + tims(timeouts()))
      timeouts().forEach(function(id) { clearTimeout(id) })
      t.end()
    }
  })
})

//
// Utilities
//

function timeout_tracker() {
  // Return an array tracking in-flight timeouts.
  var timeouts = []
  var set_num = 0

  lib.timeouts(set, clear)
  return function() { return timeouts }

  function set() {
    var result = setTimeout.apply(this, arguments)

    var caller = traceback()[2]
    set_num += 1
    result.caller = '('+set_num+') ' + (caller.method || caller.name || '<a>') + ' in ' + caller.file + ':' + caller.line
    //console.error('setTimeout: ' + result.caller)

    timeouts.push(result)
    //console.error('inflight ('+timeouts.length+'): ' + tims(timeouts))
    return result
  }

  function clear(id) {
    //var caller = traceback()[2]
    //caller = (caller.method || caller.name || '<a>') + ' in ' + caller.file + ':' + caller.line
    //console.error('clearTimeout: ' + (id && id.caller) + ' <- ' + caller)

    timeouts = timeouts.filter(function(element) { return element !== id })
    //console.error('inflight ('+timeouts.length+'): ' + tims(timeouts))
    return clearTimeout.apply(this, arguments)
  }
}

function tims(arr) {
  return JSON.stringify(arr.map(function(timer) { return timer.caller }))
}
