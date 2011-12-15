var tap = require('tap')
  , test = tap.test
  , util = require('util')
  , request = require('request')

var follow = require('../api')
  , DB = process.env.db || 'http://localhost:5984/follow_test'
  , RTT

test('Couch is there', function(t) {
  request.del({uri:DB, json:true}, function(er, res) {
    if(er) throw er;
    if(!res.body || res.body.error && res.body.error != 'not_found')
      throw new Error('Failed to delete: ' + DB)

    request.put({uri:DB, json:true}, function(er, res) {
      if(er) throw er;
      if(!res.body || res.body.error && res.body.error != 'not_found')
        throw new Error('Failed to create: ' + DB)

      var begin = new Date
      var values = ['first', 'second', 'third']
      values.forEach(function(val) {
        var doc = { _id:'doc_'+val, value:val }
        request.post({uri:DB, json:doc}, posted)
      })

      var count = 0;
      function posted(er, res) {
        if(er) throw er;
        if(res.statusCode != 201)
          throw new Error('POST document failure')

        count += 1
        if(count == values.length) {
          RTT = (new Date) - begin
          t.end()
        }
      }
    })
  })
})

test('Follow API', function(t) {
  t.ok(RTT, 'The previous test set the base round trip time')

  t.end()
})
