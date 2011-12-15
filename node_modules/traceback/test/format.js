// Stack formatting tests
//

var tap = require('tap')
  , test = tap.test
  , util = require('util')

var v8 = require('../api').v8

Error.stackTraceLimit = 100

test('Stack trace formatting', function(t) {
  var v8_version = process && process.versions && process.versions.v8
  if(v8_version != '3.6.6.8')
    console.error('Inexact V8 version match')

  var start = function() { obj.foo() }
  var obj = { foo: function() { eval('this.bar()') }
            , bar: function() { baz() }
            }
  function baz() { throw new Error('Some error') }

  var er, native_format, internal_format

  try { start() }
  catch (e) { er = e }

  native_format = er && er.stack
  t.ok(er, 'Got the error from baz')

  var v8_err
  Error.prepareStackTrace = function(er, frames) {
    var result
    try { result = v8.FormatStackTrace(er, frames) }
    catch (e) {
      v8_err = e
      result = "Unknown\nstack\nframes"
    }

    return result
  }

  er = null
  try { start() }
  catch (e) { er = e }

  // Produce the stack immediately before tap starts making Error objects.
  internal_format = er && er.stack
  delete Error.prepareStackTrace

  t.ok(er, 'Got the error from baz again')
  t.notOk(v8_err, 'No problem with preparing the trace')

  internal_format = fix(internal_format)
  native_format = fix(native_format)

  t.type(internal_format, 'string', 'v8 .stack attribute is a string')
  t.type(native_format, 'string', 'native .stack attribute is a string')

  t.equal(internal_format, native_format, 'Identical stack trace formatting between native and builtin')

  console.error(native_format)
  console.error('- vs. -')
  console.error(internal_format)

  t.end()

  function fix(stack) {
    var filename = __filename.replace(/\./g, '\\.').replace(/\//g, '\\/')
    var different_calls = new RegExp('at Test\\.<anonymous> \\(' + filename + ':\\d+:\\d+\\)')
    console.error(different_calls)
    return stack.split(/\n/).map(function(line) {
      //console.error('-> ' + line)
      return different_calls.test(line)
              ? "    -- These lines differ but that's okay --"
              : line
    }).join('\n')
  }
})
