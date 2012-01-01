var tap = require('tap')
  , test = tap.test
  , util = require('util')
  , request = require('request')

var couch = require('./couch')
  , follow = require('../api')


couch.setup(test)

test('Readable Stream API', function(t) {
  var feed = new follow.Changes

  t.is(feed.readable, true, 'Changes is a readable stream')

  t.type(feed.setEncoding, 'function', 'Changes has .setEncoding() method')
  t.type(feed.pause, 'function', 'Changes has .pause() method')
  t.type(feed.resume, 'function', 'Changes has .resume() method')
  t.type(feed.destroy, 'function', 'Changes has .destroy() method')
  t.type(feed.destroySoon, 'function', 'Changes has .destroySoon() method')
  t.type(feed.pipe, 'function', 'Changes has .pipe() method')
  return t.end()

  t.end()
})

test('Writatable Stream API', function(t) {
  var feed = new follow.Changes

  t.is(feed.writable, true, 'Changes is a writable stream')

  t.type(feed.write, 'function', 'Changes has .write() method')
  t.type(feed.end, 'function', 'Changes has .end() method')
  t.type(feed.destroy, 'function', 'Changes has .destroy() method')
  t.type(feed.destroySoon, 'function', 'Changes has .destroySoon() method')

  t.end()
})
