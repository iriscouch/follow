var tap = require('tap')
  , test = tap.test
  , util = require('util')
  , request = require('request')
  , traceback = require('traceback')

var lib = require('../lib')
  , follow = require('../api')
  , DB = process.env.db || 'http://localhost:5984/follow_test'
  , RTT

test('Find the RTT', function(t) {
  request({uri:DB+'/_local/rtt', json:true}, function(er, res) {
    t.false(er, 'Fetch the RTT value')
    t.type(res.body.ms, 'number', 'Got the RTT milliseconds')
    t.ok(res.body.ms > 0, 'RTT makes sense: ' + res.body.ms)

    RTT = res.body.ms
    t.end()
  })
})

test('Issue #8', function(t) {
  t.ok(RTT, 'RTT is known')

  // Track timeouts during the run.
  var timeouts = []
  lib.timeouts(setT, clearT)

  function setT() {
    var result = setTimeout.apply(this, arguments)
    var stack = traceback()
      , up = stack[2]
    result.caller = (up.method || up.name || '<a>') + ' in ' + up.file + ':' + up.line
    timeouts.push(result)
    //console.error('Timeouts: ' + JSON.stringify(timeouts.map(function(X) { return X.caller })))
    return result
  }

  function clearT(id) {
    var stack = traceback()
      , up = stack[2]
      , caller = (up.method || up.name || '<a>') + ' in ' + up.file + ':' + up.line
    timeouts = timeouts.filter(function(tim) { return tim !== id })
    //console.error('Timeouts: ' + JSON.stringify(timeouts.map(function(X) { return X.caller })))
    return clearTimeout.apply(this, arguments)
  }

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

    var feed = this
    feed.on('stop', check_timeouts)
    feed.stop()

    function check_timeouts() {
      t.equal(timeouts.length, 0, 'No timeouts by the time stop fires')

      lib.timeouts(badSetT, badClearT)

      // And give it a moment to try something bad.
      setTimeout(final_timeout_check, 250)
      function final_timeout_check() {
        t.equal(timeouts.length, 0, 'No lingering timeouts after teardown')
        t.false(runs.set, 'No more setTimeouts ran')
        t.false(runs.clear, 'No more clearTimeouts ran')

        t.end()
      }
    }
  })
})
