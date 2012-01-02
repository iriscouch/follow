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


var DEFS =
  { 'longpoll_header': '{"results":['
  }

module.exports = { 'Changes': Changes
                 }


util.inherits(Changes, stream)
function Changes (opts) {
  var self = this
  stream.call(self)

  self.readable = true
  self.writable = true

  opts = opts || {}
  self.feed = opts.feed || null // "continuous" or "longpoll"

  self.request = null
  self.expect = null
  self.buf = []
  self.changes = []
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

//
// Writable stream API
//

Changes.prototype.write = function(data, encoding) {
  var self = this

  data = self.normalize_data(data)

  if(self.feed === 'longpoll')
    self.buf.push(data)

  return true
}


Changes.prototype.end = function(data, encoding) {
  var self = this

  if(data)
    self.write(data, encoding)

  if(self.feed === 'longpoll') {
    var changes = [ DEFS.longpoll_header ].concat(self.buf).join('')
    try { changes = JSON.parse(changes) || {} }
    catch (er) { return self.emit('error', er) }

    if(!Array.isArray(changes.results))
      return self.emit('error', new Error('No "results" field in feed'))
    if(self.changes.length !== 0)
      return self.emit('error', new Error('Changes are already queued: ' + JSON.stringify(self.changes)))

    self.changes = changes.results
    return self.emit_changes()
  }

  self.emit('end')
}


Changes.prototype.emit_changes = function() {
  var self = this

  while(self.changes.length > 0) {
    var change = self.changes.shift()
    self.emit('data', JSON.stringify(change))
  }
}

//
// Readable/writable stream API
//

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

//
// Internal implementation
//

Changes.prototype.normalize_data = function(data) {
  var self = this

  if(self.feed !== 'continuous' && self.feed !== 'longpoll')
    return self.emit('error', new Error('Must set .feed to "continuous" or "longpoll" before writing data'))

  if(self.expect === null)
    self.expect = (self.feed == 'longpoll')
                    ? DEFS.longpoll_header
                    : ""

  var prefix = data.substr(0, self.expect.length)
  data = data.substr(prefix.length)

  var expected_part = self.expect.substr(0, prefix.length)
    , expected_remainder = self.expect.substr(expected_part.length)

  if(prefix !== expected_part)
    return self.emit('error', new Error('Prefix not expected '+util.inspect(expected_part)+': ' + util.inspect(prefix)))

  self.expect = expected_remainder
  return data
}
