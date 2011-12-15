var tap = require('tap')
  , test = tap.test
  , util = require('util')
  , request = require('request')

var follow = require('../api')
  , DB = process.env.db || 'http://localhost:5984/follow_test'

test('Follow API', function(t) {
  request({uri:DB+'/_local/rtt', json:true}, function(er, res) {
    t.false(er, 'Fetch the RTT value')

    var RTT = res.body.ms
    t.type(RTT, 'number', 'Got the RTT milliseconds')
    t.ok(RTT > 0, 'RTT makes sense: ' + RTT)

    var i = 0
      , saw = {}

    var feed = follow(DB, function(er, change) {
      t.is(this, feed, 'Callback "this" value is the feed object')

      i += 1
      t.notOk(er, 'No error coming back from follow: ' + i)
      t.equal(change.seq, i, 'Change #'+i+' should have seq_id='+i)
      saw[change.id] = true

      if(i == 3) {
        t.ok(saw.doc_first, 'Got the first document')
        t.ok(saw.doc_second, 'Got the second document')
        t.ok(saw.doc_third , 'Got the third document')

        t.end()
      }
    })
  })
})
