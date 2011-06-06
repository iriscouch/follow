// Core routines for event emitters
//

var lib = require('./lib')
  , url = require('url')
  , util = require('util')
  , request = require('request')
  , querystring = require('querystring')
  ;

var DEFAULT_HEARTBEAT = 30000;
var HEARTBEAT_TIMEOUT_COEFFICIENT = 1.2; // E.g. heartbeat 1000ms would trigger a timeout after 1200ms of no heartbeat.
var DEFAULT_MAX_RETRY_SECONDS     = 60 * 60;

var FEED_PARAMETERS   = ['since', 'limit', 'feed', 'heartbeat', 'filter', 'include_docs'];

var SUPER_CLASS = require('events').EventEmitter;
//var SUPER_CLASS = require('stream').Stream;

function Feed (db) {
  var self = this;
  SUPER_CLASS.call(self);

  self.db = db;

  self.feed = 'continuous';
  self.heartbeat         = DEFAULT_HEARTBEAT;
  self.max_retry_seconds = DEFAULT_MAX_RETRY_SECONDS;

  self.headers = {};
  self.request = {}; // Extra options for potentially future versions of request. The caller can supply them.

  self.since = 0;

  self.retry_delay = 1000; // ms

  self.pending = { request     : null
                 , activity_at : null
                 , data        : null
                 };

  // XXX
  var events = ['drain', 'error', 'close', 'pipe', 'data', 'end', 'fd'];

  events.forEach(function(ev) {
    //self.on(ev, function() { return self['on_' + ev].apply(self, arguments) });
    self.on(ev, function() {
      var args = Array.prototype.slice.call(arguments);
      self.log.debug('EVENT ' + ev + ' ' + lib.JS(args));
    })
  })
} // Feed
util.inherits(Feed, SUPER_CLASS);

Feed.prototype.start =
Feed.prototype.follow = function follow_feed(db) {
  var self = this;

  if(db)
    self.db = db;

  if(!self.db)
    throw new Error('Database URL required');

  if(self.feed !== 'continuous')
    throw new Error('The only valid feed option is "continuous"');

  if(typeof self.heartbeat !== 'number')
    throw new Error('Required "heartbeat" value');

  var parsed = url.parse(self.db);
  self.log = lib.log4js().getLogger(parsed.hostname + parsed.pathname);
  self.log.setLevel(process.env.changes_level || "info");

  return self.confirm();
}

Feed.prototype.confirm = function confirm_feed() {
  var self = this;

  self.db_safe = lib.scrub_creds(self.db);

  self.log.debug('Checking database: ' + self.db_safe);
  self.emit('confirm');

  var timeout_id = setTimeout(function() {
    return self.die(new Error('Timeout confirming database: ' + self.db_safe));
  }, self.heartbeat);

  request.get(self.db, function(er, resp, body) {
    clearTimeout(timeout_id);

    if(er)
      return self.emit('error', er);

    var db;
    try {
      db = JSON.parse(body)
    } catch(json_er) {
      return self.emit('error', json_er)
    }

    if(!db.db_name || !db.instance_start_time)
      return self.emit('error', new Error('Bad DB response: ' + body));

    self.log.debug('Confirmed db: ' + self.db_safe);
    return self.query();
  })
}

Feed.prototype.query = function query_feed() {
  var self = this;

  var query_params = {};
  FEED_PARAMETERS.forEach(function(key) {
    if(key in self)
      query_params[key] = self[key];
  })

  if(typeof query_params.filter !== 'string')
    delete query_params.filter;

  var feed_url = self.db + '/_changes?' + querystring.stringify(query_params);

  self.headers.Accept = self.headers.Accept || 'application/json';
  var req = { method : 'GET'
            , uri    : feed_url
            , headers: self.headers
            , encoding: 'utf-8'
            }

  req.changes_query = query_params;
  Object.keys(self.request).forEach(function(key) {
    req[key] = self.request[key];
  })

  self.log.debug('Querying: ' + self.db_safe);
  //self.log.debug(lib.JS(req));

  var in_flight, timeout_id;
  function on_changes_response(er, resp) {
    clearTimeout(timeout_id);

    if(er) {
      self.log.debug('Request error', er);
      return self.retry();
    }

    if(resp.statusCode !== 200) {
      self.log.debug('Bad couch changes response: ' + resp.statusCode);
      return self.retry();
    }

    self.log.debug('Good changes response');
    return self.prep(in_flight);
  }

  function on_timeout() {
    self.log.debug('Request timeout');
    return self.retry();
  }

  self.emit('query');

  req.onResponse = on_changes_response;
  timeout_id = setTimeout(on_timeout, self.heartbeat);

  in_flight = request(req);
}

Feed.prototype.prep = function prep_request(req) {
  var self = this;

  var now = new Date;
  self.pending.request = req;
  self.pending.request.created_at = now;
  self.pending.activity_at = now;
  self.pending.data        = "";
  self.pending.wait_timer  = null;

  function handler_for(ev) {
    var name = 'on_couch_' + ev;
    var inner_handler = self[name];

    function handle_confirmed_req_event() {
      if(self.pending.request === null)
        // This is fine, events coming in from old requests.
        return;

      if(self.pending.request === req)
        return inner_handler.apply(self, arguments);

      var stamp = req.created_at;
      if(!stamp)
        return self.die(new Error("Received data from unknown request")); // Pretty sure this is impossible.

      var s_to_req = (self.pending.request.created_at - stamp) / 1000;
      var s_to_now = (new Date()                      - stamp) / 1000;

      if(ev === 'end')
        return self.log.debug('Old END: to_req=' + s_to_req + 's, to_now=' + s_to_now + 's');

      if(ev === 'data') {
        self.log.debug('Old DATA: to_req=' + s_to_req + 's, to_now=' + s_to_now + 's');
        return destroy_req(req);
      }

      self.log.warn('Received "' + ev + '" from old request started ' + s_to_req + 's before current and ' + s_to_now + 's before now');
    }

    return handle_confirmed_req_event;
  }

  var handlers = ['data', 'end', 'error'];
  handlers.forEach(function(ev) {
    req.on(ev, handler_for(ev));
  })

  return self.wait();
}

Feed.prototype.wait = function wait_for_event() {
  var self = this;
  self.emit('wait');

  if(self.pending.wait_timer)
    return self.die(new Error('wait() called but there is already a wait_timer: ' + self.pending.wait_timer));

  var timeout_ms = self.heartbeat * HEARTBEAT_TIMEOUT_COEFFICIENT;

  self.log.debug('Waiting ' + timeout_ms + 'ms for data: ' + self.db_safe);
  self.pending.wait_timer = setTimeout(function() { self.on_timeout() }, timeout_ms);
}

Feed.prototype.on_couch_data = function on_couch_data(data, req) {
  var self = this;

  if(! self.pending.wait_timer)
    return self.die(new Error('Cannot find timeout timer during incoming data'));

  clearTimeout(self.pending.wait_timer);
  self.pending.wait_timer = null;
  self.pending.activity_at = new Date;

  //self.log.debug('data: ' + util.inspect(data));

  // Buf could have 0, 1, or many JSON objects in it.
  var buf = self.pending.data + data;
  var offset, json, change;

  while((offset = buf.indexOf("\n")) >= 0) {
    json = buf.substr(0, offset);
    buf = buf.substr(offset + 1);

    if(json == '') {
      // This is a heartbeat.
    } else {
      //self.log.debug('JSON: ' + json);
      try {
        change = JSON.parse(json);
      } catch(er) {
        return self.die(er);
      }

      //self.log.debug('Object:\n' + util.inspect(change));

      seq = change.seq;
      if(!seq)
        return self.die(new Error('Change has no .seq field: ' + json));

      self.on_change(change);
    }
  }

  self.pending.data = buf;
  self.wait();
}

Feed.prototype.on_timeout = function on_timeout() {
  var self = this;

  var now = new Date;
  var elapsed_ms = now - self.pending.activity_at;
  self.log.warn('Timeout after ' + elapsed_ms + 'ms; heartbeat=' + self.heartbeat);

  return self.retry();
}

Feed.prototype.retry = function retry() {
  var self = this;

  clearTimeout(self.pending.wait_timer);
  self.pending.wait_timer = null;

  self.log.info('Retrying since=' + self.since + ' after ' + self.retry_delay + 'ms: ' + self.db_safe);
  self.emit('retry');

  var req = self.pending.request;
  self.pending.request = null;
  destroy_req(req);

  setTimeout(function() { self.query() }, self.retry_delay);

  var max_retry_ms = self.max_retry_seconds * 1000;
  self.retry_delay *= 2;
  if(self.retry_delay > max_retry_ms)
    self.retry_delay = max_retry_ms;
}

Feed.prototype.on_couch_end = function on_couch_end() {
  var self = this;

  self.log.warn('Couch feed ended');
  return self.retry();
}

Feed.prototype.on_couch_error = function on_couch_error(er) {
  var self = this;

  return self.die(er);
}

Feed.prototype.die = function(er) {
  var self = this;

  self.log.fatal('Fatal error: ' + er.toString());
  
  self.emit('error', er);

  if(self.pending && self.pending.request)
    destroy_request(self.pending.request);

  //throw er;
}

Feed.prototype.on_change = function on_change(change) {
  var self = this;

  if(!change.seq)
    return self.die(new Error('No seq value in change: ' + lib.JS(change)));

  if(change.seq <= self.seen)
    return self.die(new Error('Bad seq value ' + change.seq + ' but seen=' + self.seen + ' : ' + lib.JS(change)));

  if(typeof self.filter !== 'function')
    return self.on_good_change(change);

  var req = { 'query': lib.JDUP(self.pending.request.changes_query) };
  var f_change = lib.JDUP(change); // Don't let the filter mutate the real data.
  var result = self.filter.apply(null, [f_change, req]);
  if(result) {
    self.log.debug('Builtin filter PASS for change: ' + change.seq);
    return self.on_good_change(change);
  } else
    self.log.debug('Builtin filter FAIL for change: ' + change.seq);
}

Feed.prototype.on_good_change = function on_good_change(change) {
  var self = this;

  self.emit('change', change);
}

module.exports = { "Feed" : Feed
                 };


/*
 * Utilities
 */

function destroy_req(req) {
  if(!req)
    return;

  req.response.connection.end();
  req.response.connection.destroy();
}
