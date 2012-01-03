var tap = require('tap')
  , test = tap.test
  , util = require('util')
  , request = require('request')

var couch = require('./couch')
  , follow = require('../api')


couch.setup(test)

test('Follow API', function(t) {
  var i = 0
    , saw = {}

  var feed = follow(couch.DB, function(er, change) {
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
  var feed = follow(couch.DB, function() {})

  var confirm_req = null
    , follow_req = null

  feed.on('confirm_request', function(req) { confirm_req = req })
  feed.on('query', function(req) { follow_req = req })

  setTimeout(check_req, couch.rtt() * 2)
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

test('Heartbeats', function(t) {
  t.ok(couch.rtt(), 'The couch RTT is known')
  var check_time = couch.rtt() * 3.5 // Enough time for 3 heartbeats.

  var beats = 0
    , retries = 0

  var feed = follow(couch.DB, function() {})
  feed.heartbeat = couch.rtt()
  feed.on('response', function() { feed.retry_delay = 1 })

  feed.on('heartbeat', function() { beats += 1 })
  feed.on('retry', function() { retries += 1 })

  feed.on('catchup', function() {
    t.equal(beats, 0, 'Still 0 heartbeats after receiving changes')
    t.equal(retries, 0, 'Still 0 retries after receiving changes')

    //console.error('Waiting ' + couch.rtt() + ' * 3 = ' + check_time + ' to check stuff')
    setTimeout(check_counters, check_time)
    function check_counters() {
      t.equal(beats, 3, 'Three heartbeats ('+couch.rtt()+') fired after '+check_time+' ms')
      t.equal(retries, 0, 'No retries after '+check_time+' ms')

      feed.stop()
      t.end()
    }
  })
})

test('Events for DB confirmation and hitting the original seq', function(t) {
  var feed = follow(couch.DB, on_change)

  var events = { 'confirm':null, 'catchup':null }
  feed.on('confirm', function(db) { events.confirm = db })
  feed.on('catchup', function(seq) { events.catchup = seq })

  function on_change(er, ch) {
    t.false(er, 'No problem with the feed')
    if(ch.seq == 3) {
      t.ok(events.confirm, 'Confirm event fired')
      t.equal(events.confirm && events.confirm.db_name, 'follow_test', 'Confirm event returned the Couch DB object')
      t.equal(events.confirm && events.confirm.update_seq, 3, 'Confirm event got the update_seq right')

      t.ok(events.catchup, 'Catchup event fired')
      t.equal(events.catchup, 3, 'Catchup event fired on update 3')

      feed.stop()
      t.end()
    }
  }
})

test('Handle a deleted database', function(t) {
  var feed = follow(couch.DB, function(er, change) {
    if(er)
      return t.equal(er.last_seq, 3, 'Got an error for the deletion event')

    if(change.seq < 3)
      return

    t.equal(change.seq, 3, 'Got change number 3')

    var redo_er
    couch.redo(function(er) { redo_er = er })

    setTimeout(check_results, couch.rtt() * 2)
    function check_results() {
      t.false(er, 'No problem redoing the couch')
      t.end()
    }
  })
})
