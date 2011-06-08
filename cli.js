#!/usr/bin/env node
// The changes_couchdb command-line interface.
//

var lib = require('./lib')
  , couch_changes = require('./api')
  ;

function usage() {
  console.log([ 'usage: changes_couchdb <URL>'
              , ''
              ].join("\n"));
}

var db = process.argv[2];
if(! /^https?:\/\//.test(db))
  db = 'http://' + db;

console.log('Watching:', db);

var feed = new couch_changes.Feed();
feed.db = db;
feed.since = 0;
feed.heartbeat = 3000;
feed.filter = function(doc, req) {
  // This is a local filter. It runs on the client side.
  return true;
}

feed.on('change', function(change) {
  console.log('Change:' + JSON.stringify(change));
})

feed.on('error', function(er) {
  //console.log("ERROR:", er);
  throw er;
})

feed.follow();
