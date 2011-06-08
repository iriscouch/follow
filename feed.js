// Core routines for event emitters
//

var lib = require('./lib')
  , url = require('url')
  , util = require('util')
  , request = require('request')
  , querystring = require('querystring')
  ;

var DEFAULT_HEARTBEAT = 30000;
var HEARTBEAT_TIMEOUT_COEFFICIENT = 1.25; // E.g. heartbeat 1000ms would trigger a timeout after 1250ms of no heartbeat.
var DEFAULT_MAX_RETRY_SECONDS     = 60 * 60;
var INITIAL_RETRY_DELAY           = 1000;

var FEED_PARAMETERS   = ['since', 'limit', 'feed', 'heartbeat', 'filter', 'include_docs'];

var SUPER_CLASS = require('events').EventEmitter;
//var SUPER_CLASS = require('stream').Stream;

function Feed (opts) {
  var self = this;
  SUPER_CLASS.call(self);

  self.feed = 'continuous';
  self.heartbeat         = DEFAULT_HEARTBEAT;
  self.max_retry_seconds = DEFAULT_MAX_RETRY_SECONDS;
  self.inactivity_ms = null;

  self.headers = {};
  self.request = {}; // Extra options for potentially future versions of request. The caller can supply them.

  self.since = 0;
  self.retry_delay = INITIAL_RETRY_DELAY; // ms

  opts = opts || {};
  if(typeof opts === 'string')
    opts = {'db': opts};
  Object.keys(opts).forEach(function(key) {
    self[key] = opts[key];
  })

  self.pending = { request     : null
                 , activity_at : null
                 , data        : null
                 };

  /*
  // Debugging help
  var events = ['drain', 'error', 'close', 'pipe', 'data', 'end', 'fd'];

  events.forEach(function(ev) {
    //self.on(ev, function() { return self['on_' + ev].apply(self, arguments) });
    self.on(ev, function() {
      var args = Array.prototype.slice.call(arguments);
      self.log.debug('EVENT ' + ev + ' ' + lib.JS(args));
    })
  })
  */

} // Feed
util.inherits(Feed, SUPER_CLASS);

Feed.prototype.start =
Feed.prototype.follow = function follow_feed() {
  var self = this;

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

  var confirm_timeout = self.heartbeat * 3; // Give it time to look up the name, connect, etc.
  var timeout_id = setTimeout(function() {
    return self.die(new Error('Timeout confirming database: ' + self.db_safe));
  }, confirm_timeout);

  var headers = lib.JP(lib.JS(self.headers));
  headers.accept = 'application/json';

  request({uri:self.db, headers:headers}, function(er, resp, body) {
    clearTimeout(timeout_id);

    if(er)
      return self.die(er);

    var db;
    try {
      db = JSON.parse(body)
    } catch(json_er) {
      return self.emit('error', json_er)
    }

    if(!db.db_name || !db.instance_start_time)
      return self.emit('error', new Error('Bad DB response: ' + body));

    self.log.debug('Confirmed db: ' + self.db_safe);

    if(self.since === 'now') {
      self.since = db.update_seq;
      self.log.debug('Query since "now" will start at ' + self.since);
    }

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

  self.headers.accept = self.headers.accept || 'application/json';
  var req = { method : 'GET'
            , uri    : feed_url
            , headers: self.headers
            , encoding: 'utf-8'
            }

  req.changes_query = query_params;
  Object.keys(self.request).forEach(function(key) {
    req[key] = self.request[key];
  })

  var now = new Date;
  self.log.debug('Query at ' + lib.JP(lib.JS(now)) + ': ' + lib.scrub_creds(feed_url));

  var timeout_id, timed_out = false;
  var in_flight, timeout_id, timed_out = false;

  var timed_out = false;
  function on_timeout() {
    self.log.debug('Request timeout: ' + in_flight.id());
    timed_out = true;
    return self.retry();
  }

  function on_response(er, resp) {
    clearTimeout(timeout_id);

    if(timed_out) {
      self.log.debug('Ignoring late response: ' + in_flight.id());
      return destroy_response(resp);
    }

    if(er) {
      self.log.debug('Request error ' + in_flight.id() + ': ' + er.stack);
      destroy_response(resp);
      return self.retry();
    }

    if(resp.statusCode !== 200) {
      self.log.debug('Bad changes response' + in_flight.id() + ': ' + resp.statusCode);
      destroy_response(resp);
      return self.retry();
    }

    self.log.debug('Good response: ' + in_flight.id());
    self.retry_delay = INITIAL_RETRY_DELAY;
    return self.prep(in_flight);
  }

  req.onResponse = on_response;
  timeout_id = setTimeout(on_timeout, self.heartbeat);
  in_flight = request(req);
  in_flight.created_at = now;
  in_flight.id = function() { return lib.JP(lib.JS(this.created_at)) };

  // Shorten the timestamp, used for debugging.
  //in_flight.id = function() { return /\.(\d\d\d)Z$/.exec(lib.JP(lib.JS(this.created_at)))[1] };

  return self.emit('query');
}

Feed.prototype.prep = function prep_request(req) {
  var self = this;

  var now = new Date;
  self.pending.request = req;
  self.pending.activity_at = now;
  self.pending.data        = "";
  self.pending.wait_timer  = null;

  function handler_for(ev) {
    var name = 'on_couch_' + ev;
    var inner_handler = self[name];

    function handle_confirmed_req_event() {
      if(self.pending.request === req)
        return inner_handler.apply(self, arguments);

      if(!req.created_at)
        return self.die(new Error("Received data from unknown request")); // Pretty sure this is impossible.

      var s_to_now = (new Date() - req.created_at) / 1000;
      var s_to_req = '[no req]';
      if(self.pending.request)
        s_to_req = (self.pending.request.created_at - req.created_at) / 1000;

      var msg = ': ' + req.id() + ' to_req=' + s_to_req + 's, to_now=' + s_to_now + 's';

      if(ev === 'end') {
        return self.log.debug('Old END' + msg);
        return destroy_req(req);
      }

      if(ev === 'data') {
        self.log.debug('Old DATA' + msg);
        return destroy_req(req);
      }

      self.log.warn('Old "'+ev+'"' + msg);
    }

    return handle_confirmed_req_event;
  }

  var handlers = ['data', 'end', 'error'];
  handlers.forEach(function(ev) {
    req.on(ev, handler_for(ev));
  })

  // The inactivity timer is for time between *changes*, or time between the
  // initial connection and the first change. Therefore it goes here.
  self.change_at = now;
  if(self.inactivity_ms)
    self.inactivity_timer = setTimeout(function() { self.on_inactivity() }, self.inactivity_ms);

  return self.wait();
}

Feed.prototype.wait = function wait_for_event() {
  var self = this;
  self.emit('wait');

  if(self.pending.wait_timer)
    return self.die(new Error('wait() called but there is already a wait_timer: ' + self.pending.wait_timer));

  var timeout_ms = self.heartbeat * HEARTBEAT_TIMEOUT_COEFFICIENT;
  var msg = 'Req ' + self.pending.request.id() + ' timeout=' + timeout_ms;
  if(self.inactivity_ms)
    msg += ', inactivity=' + self.inactivity_ms;
  msg += ': ' + self.db_safe;

  self.log.debug(msg);
  self.pending.wait_timer = setTimeout(function() { self.on_timeout() }, timeout_ms);
}

Feed.prototype.on_couch_data = function on_couch_data(data, req) {
  var self = this;

  if(! self.pending.wait_timer)
    return self.die(new Error('Cannot find timeout timer during incoming data'));

  clearTimeout(self.pending.wait_timer);
  self.pending.wait_timer = null;
  self.pending.activity_at = new Date;

  self.log.debug('Data from ' + self.pending.request.id());

  // Buf could have 0, 1, or many JSON objects in it.
  var buf = self.pending.data + data;
  var offset, json, change;

  while((offset = buf.indexOf("\n")) >= 0) {
    json = buf.substr(0, offset);
    buf = buf.substr(offset + 1);

    if(json == '') {
      self.log.debug('Heartbeat: ' + self.pending.request.id());
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
  self.log.warn('Closing req ' + self.pending.request.id() + ' for timeout after ' + elapsed_ms + 'ms; heartbeat=' + self.heartbeat);

  return destroy_req(self.pending.request);
  //return self.retry();
}

Feed.prototype.retry = function retry() {
  var self = this;

  clearTimeout(self.pending.wait_timer);
  self.pending.wait_timer = null;

  self.log.info('Retrying since=' + self.since + ' after ' + self.retry_delay + 'ms: ' + self.db_safe);
  self.emit('retry');

  setTimeout(function() { self.query() }, self.retry_delay);

  var max_retry_ms = self.max_retry_seconds * 1000;
  self.retry_delay *= 2;
  if(self.retry_delay > max_retry_ms)
    self.retry_delay = max_retry_ms;
}

Feed.prototype.on_couch_end = function on_couch_end() {
  var self = this;

  self.log.debug('Changes feed ended ' + self.pending.request.id());
  self.pending.request = null;
  return self.retry();
}

Feed.prototype.on_couch_error = function on_couch_error(er) {
  var self = this;

  self.log.debug('Changes query eror: ' + lib.JS(er.stack));
  return self.retry();
}

Feed.prototype.die = function(er) {
  var self = this;

  self.log.fatal('Fatal error: ' + er.stack);
  
  self.emit('error', er);

  var req = self.pending.request;
  self.pending.request = null;
  if(req) {
    self.log.debug('Destroying req ' + req.id());
    destroy_req(req);
  }

  //throw er;
}

Feed.prototype.on_change = function on_change(change) {
  var self = this;

  if(!change.seq)
    return self.die(new Error('No seq value in change: ' + lib.JS(change)));

  if(change.seq <= self.since) {
    self.log.debug('Bad seq value ' + change.seq + ' since=' + self.since);
    return destroy_req(self.pending.request);
  }

  if(typeof self.filter !== 'function')
    return self.on_good_change(change);

  var req = { 'query': lib.JDUP(self.pending.request.changes_query) };
  var f_change = lib.JDUP(change); // Don't let the filter mutate the real data.
  var result = self.filter.apply(null, [f_change, req]);
  result = (result && true) || false;
  if(result) {
    self.log.debug('Builtin filter PASS for change: ' + change.seq);
    return self.on_good_change(change);
  } else
    self.log.debug('Builtin filter FAIL for change: ' + change.seq);
}

Feed.prototype.on_good_change = function on_good_change(change) {
  var self = this;

  if(self.inactivity_ms && !self.inactivity_timer)
    return self.die(new Error('Cannot find inactivity timer during change'));

  clearTimeout(self.inactivity_timer);
  self.inactivity_timer = null;
  if(self.inactivity_ms)
    self.inactivity_timer = setTimeout(function() { self.on_inactivity() }, self.inactivity_ms);

  self.change_at = new Date;
  self.since = change.seq;
  self.emit('change', change);
}

Feed.prototype.on_inactivity = function on_inactivity() {
  var self = this;
  var now = new Date;
  var elapsed_ms = now - self.change_at;
  var elapsed_s  = elapsed_ms / 1000;

  return self.die(new Error('Req ' + self.pending.request.id() + ' made no changes for ' + elapsed_s + 's'));
}

module.exports = { "Feed" : Feed
                 };


/*
 * Utilities
 */

function destroy_req(req) {
  if(req)
    return destroy_response(req.response);
}

function destroy_response(response) {
  if(!response)
    return;

  response.connection.end();
  response.connection.destroy();
}
