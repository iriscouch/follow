//
// Copyright 2014 Iris Couch
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

var EE = require('events').EventEmitter;
var util = require('util');
var url = require('url');
var ChangeStream = require('changes-stream');
var debug = require('debug')('follow:feed');
var http = require('http-https');
var parse = require('parse-json-response');

var extend = util._extend;

module.exports = Feed;

util.inherits(Feed, EE);

function Feed (opts) {
  if (!(this instanceof Feed)) { return new Feed(opts) }
  EE.call(this);

  opts = opts || {}

  this.feed = 'continuous';
  this.heartbeat = 30 * 1000;
  this.inactivity_ms = opts.inactivity_ms;

  this.since = 0;
  this.paused = false
  this.caught_up = false

  this.reconnect = opts.reconnect || { minDelay: 100, maxDelay: 10000, retries: 3 }
  if(typeof opts === 'string')
    opts = {'db': opts};

  opts.db = opts.db || opts.url || opts.uri
  delete opts.url
  delete opts.uri

  // Overwrite any configuration
  Object.keys(opts).forEach(function(key) {
    this[key] = opts[key];
  }, this);

}

Feed.prototype.start =
Feed.prototype.follow = function () {

  if(!this.db)
    throw new Error('Database URL required');

  if(this.feed !== 'continuous' && this.feed !== 'longpoll')
    throw new Error('The only valid feed options are "continuous" and "longpoll"');

  if(typeof this.heartbeat !== 'number')
    throw new Error('Required "heartbeat" value');

  this.emit('start');
  return this.confirm();
}

Feed.prototype.confirm = function () {

  this.safeDb = scrubCreds(this.db);

  debug('confirming database');
  // Give some extra time in case it takes a bit to get response
  var error = new Error('Failed to confirm database');
  this.timer = setTimeout(this._onTimeout.bind(this, error), this.heartbeat * 3);

  var opts = url.parse(this.db);
  opts.method = 'GET';
  opts.headers = {
    accept: 'application/json'
  }

  var req = http.request(opts);
  req.on('error', this._onError.bind(this));
  req.on('response', parse(this._onConfirmRes.bind(this)));
  req.end();

  // Leave the same for consistency of user's api
  var oldReq = { uri: this.db, headers: opts.headers };
  this.emit('confirm_request', req)

}

//
// When we timeout in these cases we should emit an error or restart a changes
// feed
//
Feed.prototype._onTimeout = function (error) {
  clearTimeout(this.timer);
  this.timer = null
  this.die(error);
};

Feed.prototype._onConfirmRes = function (err, data, res) {
  if (err) {
    return this.emit('error', new Error('Could not confirm couchdb ' + err.statusCode));
  }

  if (!data.db_name || !db.instance_start_time) {
    return this.emit('error', new Error('Bad DB response ' + JSON.stringify(data)));
  }
  // Keep a reference to the whole object just in case and set the db seq
  this.dbObj = data;
  this.original_db_seq = data.update_seq;

  debug('confirmed db ' + this.safeDb);
  this.emit('confirm', data);

  //
  // Since we have confirmed the database at a particular update_seq
  // right NOW, lets just query based on that number for consistency
  //
  this.since = this.since != 'now'
    ? this.since
    : this.original_db_seq;

  if (isNaN(data.update_seq)) {
    return this.emit('error', new Error('DB has bad update_seq value ' + data.update_seq));
  }
  //
  // Fake the catchup event if we are starting from the current time period
  // anyway
  //
  if (this.original_db_seq == this.since) {
    this.caught_up = true;
    this.emit('catchup', this.since);
  }

  this.startChanges();
};

Feed.prototype.startChanges = function () {
  this.changes = new ChangesStream({
    db: this.db,
    style: this.style,
    since: this.since,
    feed: this.feed,
    filter: this.filter,
    heartbeat: this.heartbeat,
    inactivity_ms: this.inactivity_ms,
    include_docs: this.include_docs,
    // backwards compat for request options
    rejectUnauthorized: this.request && this.request.strictSSL || this.rejectUnauthorized
  });

  this.changes.on('error', this._onError.bind(this));
  this.changes.on('readable', this._onReadable.bind(this));
  // What is the real usefulness?
  this.changes.on('heartbeat', this._onHeartbeat.bind(this));
};

Feed.prototype._onHeartbeat = function () {
  this.emit('heartbeat');
};

Feed.prototype._onReadable = function () {
  var change;
  //
  // Unless we get paused read and emit all the changes out of the buffer
  //
  while (!this.paused && null !== (change = this.changes.read())) {
    if (this.original_db_seq == change.seq) {
      this.caught_up = true;
      this.emit('catchup', change.seq);
    }

    // We totally do this in changes stream as well but whatever
    this.since = change.seq;
    this.emit('change', change);
  }
};

//
// If the changes-stream ACTUALLY emits an error, we technically should
// run a cleanup and just create a new one
//
Feed.prototype._onError = function (err) {
  var reconnect = extend({}, this.reconnect);
  return back(function (fail, backoff) {
    if (fail) {
      return this.emit('error', err);
    }
    this.die();
    this.startChanges();
  }, reconnect);
};

//
// It should literally just be this simple
//
Feed.prototype.pause = function () {
  if (!this.paused) {
    this.paused = true;
    this.changes.pause();
    this.emit('pause');
  }
};

//
// It feels weird to have two layers of this but meh
// the underlying socket in the changes stream needs to be done with
// readable
//
Feed.prototype.resume = function () {
  if (this.paused) {
    this.emit('resume');
    this.paused = false;
    this.changes.resume();
  }
};

Feed.prototype.stop = function(val) {
  debug('Stop')

  // Die with no errors.
  self.die()
  self.emit('stop', val);
};

//
// Kill the internal changes stream
//
Feed.prototype.die = function (err) {
  debug('destroy the internal changes stream')
  if (this.changes) {
    this.changes.destroy();
    this.changes = null;
  }
  this.dead = true;
  this.emit('die');

  if (err) {
    this.emit('error', err);
  }
};

Feed.prototype.restart = function restart() {

  this.emit('restart')

  // Kill ourselves and then start up once again
  this.stop()
  this.dead = false
  this.start();
}

function scrubCreds (u) {
  var temp = url.parse(u);
  delete temp.auth;
  return url.format(temp);
}
