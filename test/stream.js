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

test('Error conditions', function(t) {
  var feed = new follow.Changes

  t.throws(write, 'Throw if the feed type is not defined')

  feed.feed = 'neither longpoll nor continuous'
  t.throws(write, 'Throw if the feed type is not longpoll nor continuous')

  feed = new follow.Changes({'feed':'continuous'})
  t.throws(write('stuff'), 'Throw if the "results" line is not sent first')

  feed = new follow.Changes({'feed':'continuous'})
  t.doesNotThrow(write('')    , 'Empty string is fine waiting for "results"')
  t.doesNotThrow(write('{')   , 'This could be the "results" line')
  t.doesNotThrow(write('"resu', 'Another part of the "results" line'))
  t.doesNotThrow(write('')    , 'Another empty string is still fine')
  t.doesNotThrow(write('lts":', 'Final part of "results" line still good'))
  t.throws(write(']'), 'First line was not {"results":[')

  t.end()

  function write(data) {
    if(data === undefined)
      return feed.write('blah')
    return function() { feed.write(data) }
  }
})
