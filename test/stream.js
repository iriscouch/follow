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

  feed = new follow.Changes
  feed.feed = 'neither longpoll nor continuous'
  t.throws(write, 'Throw if the feed type is not longpoll nor continuous')

  feed = new follow.Changes({'feed':'longpoll'})
  t.throws(write('stuff'), 'Throw if the "results" line is not sent first')

  feed = new follow.Changes({'feed':'longpoll'})
  t.doesNotThrow(write('')    , 'Empty string is fine waiting for "results"')
  t.doesNotThrow(write('{')   , 'This could be the "results" line')
  t.doesNotThrow(write('"resu', 'Another part of the "results" line'))
  t.doesNotThrow(write('')    , 'Another empty string is still fine')
  t.doesNotThrow(write('lts":', 'Final part of "results" line still good'))
  t.throws(write(']'), 'First line was not {"results":[')

  feed = new follow.Changes
  feed.feed = 'continuous'
  t.doesNotThrow(write(''), 'Empty string is fine for a continuous feed')
  t.throws(end('{"results":['), 'Continuous stream does not want a header')

  feed = new follow.Changes({'feed':'continuous'})
  t.throws(write('hi\n'), 'Continuous stream wants objects')

  feed = new follow.Changes({'feed':'continuous'})
  t.throws(end('[]'), 'Continuous stream wants "real" objects, not Array')

  feed = new follow.Changes({'feed':'continuous'})
  t.throws(write('{"seq":1,"id":"hi","changes":[{"rev":"1-869df2efe56ff5228e613ceb4d561b35"}]},\n'),
           'Continuous stream does not want a comma')

  var types = ['longpoll', 'continuous']
  types.forEach(function(type) {
    var bad_writes = [ {}, null, ['a string (array)'], {'an':'object'}]
    bad_writes.forEach(function(obj) {
      feed = new follow.Changes
      feed.feed = type

      t.throws(write(obj), 'Throw for bad write to '+type+': ' + util.inspect(obj))
    })

    feed = new follow.Changes
    feed.feed = type

    var valid = (type == 'longpoll')
                  ? '{"results":[\n{}\n],\n"last_seq":1}'
                  : '{"seq":1,"id":"doc"}'

    t.throws(buf(valid, 'but_invalid_encoding'), 'Throw for buffer with bad encoding')
  })

  t.end()

  function buf(data, encoding) {
    return write(new Buffer(data), encoding)
  }

  function write(data, encoding) {
    if(data === undefined)
      return feed.write('blah')
    return function() { feed.write(data, encoding) }
  }

  function end(data, encoding) {
    return function() { feed.end(data, encoding) }
  }
})

test('Longpoll feed', function(t) {
  var feed = new follow.Changes({'feed':'longpoll'})

  var data = []
  feed.on('data', function(d) { data.push(d) })

  function write(data) { return function() { feed.write(data) } }
  function end(data) { return function() { feed.end(data) } }

  t.doesNotThrow(write('{"results":[')           , 'Longpoll header')
  t.doesNotThrow(write('{}')                     , 'Empty object')
  t.doesNotThrow(write(',{"foo":"bar"},')        , 'Comma prefix and suffix')
  t.doesNotThrow(write('{"two":"bar"},')         , 'Comma suffix')
  t.doesNotThrow(write('{"three":3},{"four":4}'), 'Two objects on one line')
  t.doesNotThrow(end('],\n"last_seq":3}\n')      , 'Longpoll footer')

  t.equal(data.length, 5, 'Five data events fired')
  t.equal(data[0], '{}', 'First object emitted')
  t.equal(data[1], '{"foo":"bar"}', 'Second object emitted')
  t.equal(data[2], '{"two":"bar"}', 'Third object emitted')
  t.equal(data[3], '{"three":3}', 'Fourth object emitted')
  t.equal(data[4], '{"four":4}', 'Fifth object emitted')

  t.end()
})

test('Longpoll pause', function(t) {
  var feed = new follow.Changes({'feed':'longpoll'})
    , all = {'results':[{'change':1}, {'second':'change'},{'change':'#3'}], 'last_seq':3}
    , start = new Date

  var events = []

  feed.on('data', function(change) {
    change = JSON.parse(change)
    change.elapsed = new Date - start
    events.push(change)
  })

  feed.once('data', function(data) {
    t.equal(data, '{"change":1}', 'First data event was the first change')
    feed.pause()
    setTimeout(function() { feed.resume() }, 100)
  })

  feed.on('end', function() {
    t.equal(feed.readable, false, 'Feed is no longer readable')
    events.push('END')
  })

  setTimeout(check_events, 150)
  feed.end(JSON.stringify(all))

  function check_events() {
    t.equal(events.length, 3+1, 'Three data events, plus the end event')

    t.ok(events[0].elapsed < 10, 'Immediate emit first data event')
    t.ok(events[1].elapsed >= 100 && events[1].elapsed < 125, 'About 100ms delay until the second event')
    t.ok(events[2].elapsed - events[1].elapsed < 10, 'Immediate emit of subsequent event after resume')
    t.equal(events[3], 'END', 'End event was fired')

    t.end()
  }
})

test('Continuous feed', function(t) {
  var feed = new follow.Changes({'feed':'continuous'})

  var data = []
  feed.on('data', function(d) { data.push(d) })
  feed.on('end', function() { data.push('END') })

  function write(data) { return function() { feed.write(data) } }
  function end(data) { return function() { feed.end(data) } }

  // This also tests whether the feed is compacting or tightening up the JSON.
  t.doesNotThrow(write('{    }\n')                   , 'Empty object')
  t.doesNotThrow(write('\n')                         , 'Heartbeat')
  t.doesNotThrow(write('{ "foo" : "bar" }\n')        , 'One object')
  t.doesNotThrow(write('{"three":3}\n{ "four": 4}\n'), 'Two objects sent in one chunk')
  t.doesNotThrow(write('')                           , 'Empty string')
  t.doesNotThrow(write('')                           , 'Another empty string')
  t.doesNotThrow(write('{   "end"  ')                , 'Partial object 1/4')
  t.doesNotThrow(write(':')                          , 'Partial object 2/4')
  t.doesNotThrow(write('tru')                        , 'Partial object 3/4')
  t.doesNotThrow(end('e}\n')                         , 'Partial object 4/4')

  t.equal(data.length, 6 + 1, 'Five objects emitted, plus a heartbeat, plus the end event')
  t.equal(data[0], '{}', 'First object emitted')
  t.equal(data[1], '', 'Heartbeat after first object')
  t.equal(data[2], '{"foo":"bar"}', 'Second object emitted')
  t.equal(data[3], '{"three":3}', 'Third object emitted')
  t.equal(data[4], '{"four":4}', 'Fourth object emitted')
  t.equal(data[5], '{"end":true}', 'Fifth object emitted')
  t.equal(data[6], 'END', 'End event fired')

  t.end()
})

test('Continuous pause', function(t) {
  var feed = new follow.Changes({'feed':'continuous'})
    , all = [{'change':1}, {'second':'change'},{'#3':'change'}]
    , start = new Date

  var events = []

  feed.on('end', function() {
    t.equal(feed.readable, false, 'Feed is not readable after "end" event')
    events.push('END')
  })

  feed.on('data', function(change) {
    change = JSON.parse(change)
    change.elapsed = new Date - start
    events.push(change)
  })

  feed.once('data', function(data) {
    t.equal(data, '{"change":1}', 'First data event was the first change')
    t.equal(feed.readable, true, 'Feed is readable after first data event')
    feed.pause()
    t.equal(feed.readable, true, 'Feed is readable after pause()')

    setTimeout(unpause, 100)
    function unpause() {
      t.equal(feed.readable, true, 'Feed is readable just before resume()')
      feed.resume()
    }
  })

  setTimeout(check_events, 150)
  all.forEach(function(obj) {
    feed.write(JSON.stringify(obj))
    feed.write("\r\n")
  })
  feed.end()

  function check_events() {
    t.equal(events.length, 3+1, 'Three data events, plus the end event')

    t.ok(events[0].elapsed < 10, 'Immediate emit first data event')
    t.ok(events[1].elapsed >= 100 && events[1].elapsed < 125, 'About 100ms delay until the second event')
    t.ok(events[2].elapsed - events[1].elapsed < 10, 'Immediate emit of subsequent event after resume')
    t.equal(events[3], 'END', 'End event was fired')

    t.end()
  }
})
