var tap = require('tap')
  , test = tap.test
  , util = require('util')
  , request = require('request')

var follow = require('../api')
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

test('Follow API', function(t) {
  t.ok(RTT, 'RTT is known')

  var i = 0
    , saw = {}

  var feed = follow(DB, function(er, change) {
    t.is(this, feed, 'Callback "this" value is the feed object')

    i += 1
    t.false(er, 'No error coming back from follow: ' + i)
    t.equal(change.seq, i, 'Change #'+i+' should have seq_id='+i)
    saw[change.id] = true

    if(i == 3) {
      t.ok(saw.doc_first, 'Got the first document')
      t.ok(saw.doc_second, 'Got the second document')
      t.ok(saw.doc_third , 'Got the third document')

      t.doesNotThrow(function() { feed.stop() }, 'No problem calling stop()')

      t.end()
    }
  })
})

test("Confirmation request behavior", function(t) {
  var feed = follow(DB, function() {})

  var confirm_req = null
  feed.on('confirm_request', function(req) { confirm_req = req })

  setTimeout(check_req, RTT * 2)
  function check_req() {
    t.ok(confirm_req, 'The confirm_request event should have fired by now')

    feed.stop()
    t.end()
  }
})
