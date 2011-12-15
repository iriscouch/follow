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
    , follow_req = null

  feed.on('confirm_request', function(req) { confirm_req = req })
  feed.on('query', function(req) { follow_req = req })

  setTimeout(check_req, RTT * 2)
  function check_req() {
    t.ok(confirm_req, 'The confirm_request event should have fired by now')
    t.ok(confirm_req.agent, 'The confirm request has an agent')

    t.ok(follow_req, 'The follow_request event should have fired by now')
    t.ok(follow_req.agent, 'The follow request has an agent')

    // Confirm that the changes follower is not still in the pool.
    var host = 'localhost:5984'
    follow_req.req.agent.sockets[host].forEach(function(socket, i) {
      t.isNot(socket, follow_req.req.connection, 'The changes follower is not socket '+i+' in the agent pool')
    })

    feed.stop()
    t.end()
  }
})
