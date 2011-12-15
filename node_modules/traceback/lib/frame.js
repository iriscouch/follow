// An easier CallSite object
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
  , path = require('path')
  , assert = require('assert')

exports.make = make_easy

function make_easy(call_site) {
  var frame = Object.create(call_site)

  frame.this      = frame.getThis()
  frame.type      = frame.getTypeName()
  frame.is_top    = frame.isToplevel()
  frame.is_eval   = frame.isEval()
  frame.origin    = frame.getEvalOrigin()
  frame.script    = frame.getScriptNameOrSourceURL()
  frame.fun       = frame.getFunction()
  frame.name      = frame.getFunctionName()
  frame.method    = frame.getMethodName()
  frame.path      = frame.getFileName()
  frame.line      = frame.getLineNumber()
  frame.col       = frame.getColumnNumber()
  frame.is_native = frame.isNative()
  frame.pos       = frame.getPosition()
  frame.is_ctor   = frame.isConstructor()

  frame.file = path.basename(frame.path)
  //frame.self = frame.this

  frame.toJSON = toJSON

  return frame
}

function toJSON() {
  var self = this;

  var result = {}
  Object.keys(self).forEach(function(key) {
    var val = self[key]

    if(key == 'toJSON')
      return
    else if(key == 'this')
      result[key] = "" + val
    else if(typeof val == 'function')
      result[key] = "" + val
    else
      result[key] = self[key]
  })

  return result
}
