// CouchDB tests
//
// This module is also a library for other test modules.

var tap = require('tap')
  , util = require('util')
  , assert = require('assert')
  , request = require('request')

var follow = require('../api')
  , DB = process.env.db || 'http://localhost:5984/follow_test'
  , RTT = null


module.exports = { 'DB': DB
                 , 'rtt' : get_rtt
                 , 'redo': redo_couch
                 , 'setup': setup_test
                 }


function get_rtt() {
  if(!RTT)
    throw new Error('RTT was not set. Use setup(test) or redo(callback)')
  return RTT
}


// Basically a redo but testing along the way.
function setup_test(test_func) {
  assert.equal(typeof test_func, 'function', 'Please provide tap.test function')

  test_func('Initialize CouchDB', function(t) {
    init_db(t, function(er, rtt) {
      RTT = rtt
      t.end()
    })
  })
}

function redo_couch(callback) {
  function noop() {}
  var t = { 'ok':noop, 'false':noop, 'equal':noop, 'end':noop }
  init_db(t, function(er, rtt) {
    if(rtt)
      RTT = rtt
    return callback(er)
  })
}

function init_db(t, callback) {
  var create_begin = new Date

  request.del({uri:DB, json:true}, function(er, res) {
    t.false(er, 'Clear old test DB: ' + DB)
    t.ok(!res.body.error || res.body.error == 'not_found', 'Couch cleared old test DB: ' + DB)

    request.put({uri:DB, json:true}, function(er, res) {
      t.false(er, 'Create new test DB: ' + DB)
      t.false(res.body.error, 'Couch created new test DB: ' + DB)

      var values = ['first', 'second', 'third']
        , stores = 0
      values.forEach(function(val) {
        var doc = { _id:'doc_'+val, value:val }

        request.post({uri:DB, json:doc}, function(er, res) {
          t.false(er, 'POST document')
          t.equal(res.statusCode, 201, 'Couch stored test document')

          stores += 1
          if(stores == values.length) {
            var rtt = (new Date) - create_begin
            callback(null, rtt)
            //request.post({uri:DB, json:{_id:'_local/rtt', ms:(new Date)-begin}}, function(er, res) {
            //  t.false(er, 'Store RTT value')
            //  t.equal(res.statusCode, 201, 'Couch stored RTT value')
            //  t.end()
            //})
          }
        })
      })
    })
  })
}

if(require.main === module)
  setup_test(tap.test)
