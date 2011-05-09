// Follow a CouchDB changes feed.
//

var lib = require('../lib')
  , request = require('request')
  , events = require('events')
  ;

var LOG = lib.logging.getLogger('couch_changes');
LOG.setLevel(process.env.changes_level || "info");

function scrub_creds(url) {
  return url.replace(/^(https?:\/\/)[^:]+:[^@]+@(.*)$/, '$1$2'); // Scrub username and password
}

// Start a changes request.
exports.follow = function(opts, cb) {
  LOG.debug('Beginning changes request: ' + scrub_creds(opts.db));

  var req_opts = {uri:opts.db};
  var heartbeat_ms = opts.heartbeat || 2500
    , timeout_ms = heartbeat_ms * 3;

  if(req_opts.uri[req_opts.uri.length - 1] != '/')
    req_opts.uri += '/';
  req_opts.uri += '_changes?feed=continuous&heartbeat=' + heartbeat_ms;

  // include_docs default is TRUE unless explicitly asked to be disabled.
  if(opts.include_docs !== false)
    req_opts.uri += '&include_docs=true';

  Object.keys(opts).forEach(function(key) {
    if(key == 'db' || key == 'heartbeat') {
      // No copy.
    } else if(key == 'filter' && typeof opts[key] == 'function') {
      var old_cb = cb, filter = opts[key];
      cb = function(change) {
        if(old_cb) {
          var req = {query: JSON.parse(JSON.stringify(opts))};
          if(filter(change.doc, req))
            old_cb(change);
          else {
            //LOG.debug("FILTERED\n" + require('sys').inspect(change));
          }
        }
      }
    } else {
      req_opts.uri += lib.sprintf('&%s=%s', key, opts[key]);
    }
  })

  var seq = opts.since || 0;
  var timeout_id, retried = false;
  var retry = function(delay) {
    if(retried) {
      LOG.warn("This retry already ran, aborting");
      return;
    } else {
      retried = true;
    }
    LOG.debug('Retrying from seq: ' + seq + (delay ? (" after " + delay + "s") : ""));
    clearTimeout(timeout_id);

    // No-op the existing stream in case anything else comes in later.
    if(req_opts.client) {
      req_opts.client.end();
      LOG.debug('Closed old changes client');
    }
    req_opts.responseBodyStream.write = function(chunk) { LOG.warn("Ignoring old change feed " + req_opts.uri + ": " + JSON.stringify(chunk)) };
    req_opts.responseBodyStream.end = function() { LOG.warn("Closing old change feed: " + req_opts.uri) };

    var new_opts = JSON.parse(JSON.stringify(opts));
    new_opts.since = seq;

    if(delay)
      setTimeout(function() { exports.follow(new_opts, cb); }, delay * 1000);
    else
      exports.follow(new_opts, cb);
  }

  var timeout_id;
  var timed_out = function() {
    LOG.error('Retry on heartbeat timeout after ' + timeout_ms + 'ms');
    retry();
  }

  var buf = '';
  req_opts.responseBodyStream = new events.EventEmitter;
  req_opts.responseBodyStream.write = function(chunk) {
    buf += (chunk || '');

    clearTimeout(timeout_id);
    timeout_id = setTimeout(timed_out, timeout_ms);

    // Buf could have 0, 1, or many JSON objects in it.
    var offset, json;
    while((offset = buf.indexOf("\n")) >= 0) {
      json = buf.substr(0, offset);
      buf = buf.substr(offset + 1);

      if(json == '') {
        // This is a heartbeat.
      } else {
        //LOG.debug('JSON: ' + json);
        var change = JSON.parse(json);
        //LOG.debug('Object:\n' + require('sys').inspect(change));

        seq = change.seq;
        if(!seq) {
          LOG.fatal("seq was not defined in change: " + json);
          throw new Error("seq was not defined in change: " + json);
        }

        cb && cb(change);
      }
    }
  }

  req_opts.responseBodyStream.end = function() {
    LOG.error("A changes feed should never end. Restarting from last known sequence: " + seq);
    retry();
  }

  var clean_req = JSON.parse(JSON.stringify(req_opts));
  clean_req.uri = scrub_creds(clean_req.uri);
  LOG.debug('Requesting: ' + JSON.stringify(clean_req));

  request(req_opts, function(er, res, bodyStream) {
    LOG.debug('Called back: ' + require('sys').inspect({er:er, res:res, bodyStream:bodyStream}));
    if(er) {
      LOG.error('Error requesting "' + JSON.stringify(req_opts.uri), er);
      retry(10);
    }
  })

  timeout_id = setTimeout(timed_out, timeout_ms);
}
