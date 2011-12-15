var tap = require('tap')
  , test = tap.test
  , util = require('util')

var traceback = require('../api')

test('Traceback API', function(t) {
  var stack;

  stack = null
  t.doesNotThrow(function() { stack = traceback() }, 'No problem calling as a function')
  t.ok(stack, 'traceback() returns a stack')

  stack = null
  t.doesNotThrow(function() { stack = traceback.raw() }, 'No problem calling traceback.raw()')
  t.ok(stack, 'traceback.raw() returns a stack')

  t.end()
})

test('Traceback convenience attributes', function(t) {
  var stack = traceback()
  t.ok(stack, 'Got a stack from traceback')
  stack.forEach(frame_tester('easy'))

  var old_len = stack.length

  stack = traceback.raw()
  t.ok(stack, 'Got a raw stack traceback')
  t.equal(stack.length, old_len, 'Same length of tracebacks')
  stack.forEach(frame_tester('raw'))

  t.end()

  function frame_tester(frame_type) {
    return test_frame

    function tt() {
      var meth = (frame_type == 'easy') ? t.ok : t.notOk
      return meth.apply(t, arguments)
    }

    function test_frame(frame, i) {
      var message = (frame_type == 'easy')
                      ? 'Has convenience attribute ('+i+'): '
                      : 'Does not have convenience attribute ('+i+'): '

      // These are in both implementations.
      t.ok('fun' in frame, 'Always has convenience attribute ('+i+'): fun')
      t.ok('pos' in frame, 'Always has convenience attribute ('+i+'): pos')
      t.type(frame.fun, 'function', 'Frame .fun is a function')

      tt('this' in frame, message + 'this')
      tt('type' in frame, message + 'type')
      tt('origin' in frame, message + 'origin')
      tt('script' in frame, message + 'script')
      tt('name' in frame, message + 'name')
      tt('method' in frame, message + 'method')
      tt('path' in frame, message + 'path')
      tt('line' in frame, message + 'line')
      tt('col' in frame, message + 'col')
      tt('is_top' in frame, message + 'is_top')
      tt('is_eval' in frame, message + 'is_eval')
      tt('is_ctor' in frame, message + 'is_ctor')
      tt('is_native' in frame, message + 'is_native')

      if(frame_type == 'easy') {
        t.type(frame.line, 'number', 'Number attribute ('+i+'): line')
        t.type(frame.col, 'number', 'Number attribute ('+i+'): col')

        t.type(frame.is_top, 'boolean', 'Boolean attribute ('+i+'): is_top')
        t.type(frame.is_eval, 'boolean', 'Boolean attribute ('+i+'): is_eval')
        t.type(frame.is_ctor, 'boolean', 'Boolean attribute ('+i+'): is_ctor')
        t.type(frame.is_native, 'boolean', 'Boolean attribute ('+i+'): is_native')
      }
    }
  }
})

test('Serializing', function(t) {
  var stack = traceback()
  t.ok(stack, 'Got a stack from traceback')

  var json
  t.doesNotThrow(function() { json = JSON.stringify(stack) }, 'No problem using JSON.stringify')
  t.type(json, 'string', 'JSON stringification produced a string')

  var back
  t.doesNotThrow(function() { back = JSON.parse(json) }, 'No problem parsing the stack from JSON')
  t.ok(Array.isArray(back), 'Stack round-trip through JSON makes an array')
  t.ok(back.length > 1, 'Stack has some length')

  back.forEach(function(frame) {
    t.type(frame, 'object', 'Each frame after a JSON round-trip is an object')
  })

  t.end()
})
