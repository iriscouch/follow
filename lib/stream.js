// Changes stream
//
// Copyright 2011 Iris Couch
//
//    Licensed under the Apache License, Version 2.0 (the "License");
//    you may not use this file except in compliance with the License.
//    You may obtain a copy of the License at
//
//        http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//    See the License for the specific language governing permissions and
//    limitations under the License.

var lib = require('../lib')
  , util = require('util')
  , stream = require('stream')
  , request = require('request')

// Use the library timeout functions, primarily so the test suite can catch errors.
var setTimeout = lib.setTimeout
  , clearTimeout = lib.clearTimeout


module.exports = { 'Changes': Changes
                 }


util.inherits(Changes, stream)
function Changes (opts) {
  var self = this
  stream.call(self)

  self.readable = true
  self.writable = false // TODO: Probably need to be writable to pipe the HTTP request in.

  self.request = null
}


Changes.prototype.assert_request = function() {
  var self = this
  if(!self.request)
    throw new Error('No incoming request yet')
}


Changes.prototype.setEncoding = function(encoding) {
  var self = this
  self.assert_request()
  return self.request.setEncoding(encoding)
}


Changes.prototype.pause = function() {
  var self = this
  self.assert_request()
  return self.request.pause()
}


Changes.prototype.resume = function() {
  var self = this
  self.assert_request()
  return self.request.resume()
}


Changes.prototype.destroy = function() {
  var self = this
  self.assert_request()
  return self.request.destroy()
}


Changes.prototype.destroySoon = function() {
  var self = this
  self.assert_request()
  return self.request.destroySoon()
}
