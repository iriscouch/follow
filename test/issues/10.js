var tap = require('tap')
  , test = tap.test
  , util = require('util')

// Issue #10 is about missing log4js. This file sets the environment variable to disable it.
process.env.log_plain = true

var lib = require('../../lib')
  , couch = require('../couch')
  , follow = require('../../api')

couch.setup(test)

test('Issue #9', function(t) {
  follow({db:couch.DB, inactivity_ms:30000}, function(er, change) {
    console.error('Change: ' + JSON.stringify(change))
    if(change.seq == 1)
      return // Let it run through once, just for fun.

    //t.equal(change.seq, 2, 'The second change will be the last')
    this.stop()

    setTimeout(finish, 250)
    function finish() {
      t.end()
    }
  })
})
