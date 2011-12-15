var tap = require('tap')
  , test = tap.test
  , util = require('util')


// The problem is that tap itself is creating Error objects and looking at stacks
// all the time. So just to help things, use the real formatter in that case.
function real_prep(er, stack) {
  var er = new Error
    , getter = er.__lookupGetter__('stack')

  return getter.apply(er, [er, stack])
}

test('Failure to import', function(t) {
  t.notOk(Error.prepareStackTrace, 'Nothing in Error.prepareStackTrace yet')

  var ran;
  Error.prepareStackTrace = function(er, stack) {
    ran = true
    return 'one\ntwo'
  }

  t.throws(function() { require('../api') }, 'Traceback will not import if Error.prepareStackTrace is set')
  t.ok(ran, 'The custom prepareStackTrace ran')

  t.end()
})

test('Failure to make a trace', function(t) {
  delete Error.prepareStackTrace
  t.notOk(Error.prepareStackTrace, 'Nothing in Error.prepareStackTrace anymore')

  var traceback
  t.doesNotThrow(function() { traceback = require('../api') }, 'No problem importing after deletion')
  t.type(traceback, 'function', 'Imported the traceback API')

  var prep_ran = false
  Error.prepareStackTrace = my_prep
  function my_prep(er, stack) {
    if(er.message != '') // These are produce by node-tap itself.
      prep_ran = true
    return 'three\nfour'
  }

  var stack, err
  try { stack = traceback() }
  catch(er) { err = er }

  t.ok(stack, 'traceback() did not return after Error.prepareStackTrace was set')
  t.notOk(err, 'traceback() successfully runs even if Error.prepareStackTrace is set')

  t.notOk(prep_ran, 'Custom prepareStackTrace never ran')
  t.is(Error.prepareStackTrace, my_prep, 'Error.prepareStackTrace is still set to its original value')

  var a_stack = new Error('Making a stack').stack
  t.ok(prep_ran, 'prepareStackTrace function still runs normally')

  delete Error.prepareStackTrace

  t.end()
})

test('Failure to clean up with custom prepareStackTrace', function(t) {
  // This assumes some details about the implementation but I think it's worth it.
  var traceback = require('../api')
  t.notOk('prepareStackTrace' in Error, 'No original prepare function yet')

  function prep(er, stack) {
    //console.error('prep running: ' + er.message + ': ' +
    //              stack.map(function(fr) {
    //                return fr.getFileName() + ':' + fr.getLineNumber() +
    //                       ' ' + fr.getFunctionName()
    //              }).join('\n'))
    return "row 1\nrow 2\nrow 3"
  }

  Error.prepST = prep
  Error.__defineGetter__('prepareStackTrace', function() { return this.prepST })

  var prep_sets = 0
  Error.__defineSetter__('prepareStackTrace', function(val) {
    //console.error('setting prepareStackTrace: ' + util.inspect(val))
    if(val !== prep) {
      this.prepST = val
      return
    }

    prep_sets += 1
    if(prep_sets == 1)
      throw new Error('Causing an error when restoring prepareStackTrace')
    this.prepST = val
  })


  var stack, err
  try { stack = traceback() }
  catch(er) { err = er }

  t.notOk(stack, 'Stack was never set because restoring the preparer threw an exception')
  t.ok(err, 'An error was thrown when running traceback due to the bomb')
  t.equal(err.message, 'Causing an error when restoring prepareStackTrace', 'The bomb went off')
  t.equal(err.stack, "row 1\nrow 2\nrow 3", 'Errors thrown from the traceback code should still use my formatter')

  var normal_err = new Error('I am a normal error')
  t.equal(normal_err.stack, "row 1\nrow 2\nrow 3", 'Stack should be what my custom prep function makes')

  normal_err = null
  try { throw new Error('A normal throw') }
  catch (er) { normal_err = er }

  t.ok(normal_err, 'A normal throw should work')
  t.equal(normal_err.stack, 'row 1\nrow 2\nrow 3', 'Stack from a throw should use my custom prep function')

  t.end()
})

test('Failure to clean up with no prepareStackTrace', function(t) {
  // This assumes some details about the implementation but I think it's worth it.
  var traceback = require('../api')

  delete Error.prepareStackTrace
  delete Error.original_prepareStackTrace
  delete Error.prepST

  t.notOk('prepareStackTrace' in Error, 'No old test prepare function')

  Error.__defineGetter__('prepareStackTrace', function() { return this.prepST })
  Error.__defineSetter__('prepareStackTrace', function(val) {
    //console.error('setting prepareStackTrace: ' + util.inspect(val))
    if(typeof val == 'undefined')
      throw new Error('Causing an error when clearing prepareStackTrace')

    this.prepST = val
  })


  var stack, err
  try { stack = traceback() }
  catch(er) { err = er }

  // Compute the stack now before tap starts using Error objects again.
  var err_stack = err.stack

  t.notOk(stack, 'Stack was never set because restoring the preparer threw an exception')
  t.ok(err, 'An error was thrown when running traceback due to the bomb')
  t.equal(err.message, 'Causing an error when clearing prepareStackTrace', 'The bomb went off')

  test_stack(err_stack, 'Causing an error when clearing prepareStackTrace')

  var normal_err = new Error('I am a normal error')
  test_stack(normal_err.stack, 'I am a normal error')

  normal_err = null
  try { throw new Error('A normal throw') }
  catch (er) { normal_err = er }
  test_stack(normal_err.stack, 'A normal throw')

  t.end()

  function test_stack(stack, message) {
    stack = stack.split(/\n/)
    t.ok(stack[0].match(new RegExp('Error: '+message+'$')), 'Correct first stack line')
    t.ok(stack[1].match(/^    at /), 'Correct second stack line')
    t.ok(stack[2].match(/^    at /), 'Correct third stack line')
    t.ok(stack[3].match(/^    at /), 'Correct fourth stack line')
  }
})
