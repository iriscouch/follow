exports.scrub_creds = function scrub_creds(url) {
  return url.replace(/^(https?:\/\/)[^:]+:[^@]+@(.*)$/, '$1$2'); // Scrub username and password
}

exports.JP = JSON.parse;
exports.JS = JSON.stringify;
exports.JDUP = function(obj) { return JSON.parse(JSON.stringify(obj)) };

// Wrap log4js so it will not be a dependency.
var VERBOSE = (process.env.verbose === 'true');

var noop = function() {};
var noops = { "trace": noop
            , "debug": VERBOSE ? console.log   : noop
            , "info" : VERBOSE ? console.info  : noop
            , "warn" : VERBOSE ? console.warn  : noop
            , "error": VERBOSE ? console.error : noop
            , "fatal": VERBOSE ? console.error : noop

            , "setLevel": noop
            }

try {
  exports.log4js = require('log4js');
} catch(e) {
  exports.log4js = function() {
    return { 'getLogger': function() { return noops }
           }
  }
}
