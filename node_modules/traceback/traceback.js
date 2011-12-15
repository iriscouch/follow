// Traceback
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var util = require('util')
  , assert = require('assert')

var frame = require('./lib/frame')
  , v8 = require('./lib/v8')


if(Error.prepareStackTrace)
  throw new Error('Traceback does not support Error.prepareStackTrace being defined already')

// The module API
module.exports = traceback
module.exports.raw = raw


// The public API call takes no arguments.
function raw() {
  return raw_traceback(raw)
}

function traceback() {
  var stack = raw_traceback(traceback)
  //console.error('Returning easy stack')
  return stack.map(function(callsite) { return frame.make(callsite) })
}

// The design:
//
// Unfortunately, only way to access raw stack frames is through one global
// function callback, Error.prepareStackTrace. See
// node/deps/v8/src/messages.js. So, despite this module having nothing to do
// with error handling at all, it must do a lot with the Error system.
//
// It won't work to simply set Error.prepareStackTrace and leave it there
// forever. Other code will want to print normal exceptions, formatted
// normally. Many people expect an error .stack attribute to be a string, and
// to be formatted in exactly the right way. This module therefore tries to be
// as conservative as possible.
//
// First, when a stack is requested, the idea is to hook in to
// prepareStackTrace, use it, then reset things back to normal. As long as the
// original Error.prepareStackTrace is in place, then people will get their
// expected .stack formatting. The most typical case is that it is
// undefined/deleted, and the built-in V8 code mentioned above will run.
//
// But, this module itself might throw an exception, leaving prepareStackTrace
// pointing to the wrong function. That is why `getting_the_stack` is in the
// module. Before every traceback call, it is set from null to a real object.
// When our prepareStackTrace runs, it checks that the "error" object it got is
// identical to getting_the_stack. If they are identical, then, yep, things are
// working fine. After executing, getting_the_stack is set back to null.
//
// If cleanup failed somehow, and then a normal Error is created later, this
// code will be called again, inappropriately. It will detect this situation
// because the incoming error object will not be getting_the_stack. To recover,
// it just restores the correct prepareStackTrace function. But it is still on
// the hook to return a formatted stack value.
//
// If the original prepareStackTrace is an actual function, it can be called to
// produce the expected .stack value. Unfortunately, the most common situation
// is that it should be *undefined*, and the built-in V8 formatter is desired.
// But there is no way to execute that code on the given error object. I
// checked. It sucks. So the final workaround is to ship a copy of that
// formatter and use it as a last resort.
//
// In any case, the correct Error.prepareStackTrace value will be restored, so
// subsequent exceptions will get the right behavior.

var getting_the_stack = null

function raw_traceback(begin_func) {
  assert.ok(begin_func, 'Must supply begin_func')

  var stack = null
    , error = null

  if(Error.original_prepareStackTrace) // Should be quite rare
    console.error('Traceback error detected: Error.original_prepareStackTrace exists')
  else
    Error.original_prepareStackTrace = Error.prepareStackTrace

  getting_the_stack = {}

  try {
    //console.error('Beginning capture')
    Error.captureStackTrace(getting_the_stack, begin_func)
    Error.prepareStackTrace = return_raw_stack
    stack = getting_the_stack.stack // This actually calls the prepareStackTrace function
  } catch (capture_er) {
    //console.error('= Capture error =')
    error = capture_er
  } finally {
    getting_the_stack = null
    Error.prepareStackTrace = Error.original_prepareStackTrace // TODO could this ever fail?
    delete Error.original_prepareStackTrace
  }

  if(error)
    throw error
  else if(stack)
    return stack
  else
    throw new Error('Unknown result getting the stack')
}


function return_raw_stack(er, stack) {
  if(getting_the_stack && er === getting_the_stack)
    return stack;

  // At this point something has gone wrong. Try to recover the existing prep function.
  if(Error.original_prepareStackTrace) {
    //console.error('Restoring original prepareStackTrace')
    Error.prepareStackTrace = Error.original_prepareStackTrace
    delete Error.original_prepareStackTrace
    return Error.prepareStackTrace(er, stack)
  }

  //console.error('Returning to normal (deleted) Error.prepareStackTrace')
  delete Error.prepareStackTrace
  return v8.FormatStackTrace(er, stack)
}
