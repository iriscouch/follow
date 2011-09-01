#!/usr/bin/env node
// The follow command-line interface.
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

var lib = require('./lib')
  , couch_changes = require('./api')
  ;

function usage() {
  console.log([ 'usage: follow <URL>'
              , ''
              ].join("\n"));
}

var db = process.argv[2];
if(! /^https?:\/\//.test(db))
  db = 'http://' + db;

console.log('Watching:', db);

var feed = new couch_changes.Feed();
feed.db = db;
feed.since = (process.env.since === 'now') ? 'now' : parseInt(process.env.since || '0');
feed.heartbeat = parseInt(process.env.heartbeat || '3000');

if(process.env.host)
  feed.headers.host = process.env.host;

if(process.env.inactivity)
  feed.inactivity_ms = parseInt(process.env.inactivity);

function simple_filter(doc, req) {
  // This is a local filter. It runs on the client side.
  return true;
}

if(process.env.filter)
  feed.filter = simple_filter;

feed.on('confirm', function() {
  console.log('Database confirmed: ' + db);
})

feed.on('change', function(change) {
  console.log('Change:' + JSON.stringify(change));
})

feed.on('retry', function(state) {
  console.log('Retry since ' + state.since + ' after ' + state.after + 'ms');
})

feed.on('response', function() {
  console.log('Streaming response:');
})

feed.on('error', function(er) {
  //console.error(er);
  console.error('Changes error ============\n' + er.stack);
  setTimeout(function() { process.exit(0) }, 100);
})

process.on('uncaughtException', function(er) {
  console.log('========= UNCAUGHT EXCEPTION; This is bad');
  console.log(er.stack);
  setTimeout(function() { process.exit(1) }, 100);
})

feed.follow();
