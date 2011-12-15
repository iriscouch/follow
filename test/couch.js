var tap = require('tap')
  , test = tap.test
  , util = require('util')
  , request = require('request')

var follow = require('../api')
  , DB = process.env.db || 'http://localhost:5984/follow_test'

test('Couch is there', function(t) {
  request.del({uri:DB, json:true}, function(er, res) {
    t.false(er, 'Clear old test DB: ' + DB)
    t.ok(!res.body.error || res.body.error == 'not_found', 'Couch cleared old test DB: ' + DB)

    request.put({uri:DB, json:true}, function(er, res) {
      t.false(er, 'Create new test DB: ' + DB)
      t.false(res.body.error, 'Couch created new test DB: ' + DB)

      var begin = new Date
      var values = ['first', 'second', 'third']
      values.forEach(function(val) {
        var doc = { _id:'doc_'+val, value:val }
        request.post({uri:DB, json:doc}, posted)
      })

      var count = 0;
      function posted(er, res) {
        t.false(er, 'POST document')
        t.equal(res.statusCode, 201, 'Couch stored test document')

        count += 1
        if(count == values.length) {
          RTT = (new Date) - begin
          request.post({uri:DB, json:{_id:'_local/rtt', ms:(new Date)-begin}}, function(er, res) {
            t.false(er, 'Store RTT value')
            t.equal(res.statusCode, 201, 'Couch stored RTT value')

            t.end()
          })
        }
      }
    })
  })
})
