var traceback = require('../traceback');

function start() { first() }
function first() { second() }
var second = function() { last() }

function last() {
  var stack = traceback();
  console.log('I am ' + stack[0].name + ' from file ' + stack[0].file)

  for(var i = 1; i <= 3; i++)
    console.log('  ' + i + ' above me: ' + stack[i].name + ' at line ' + stack[i].line);
}

start();


if(require.main === module)
  console.log('ok')
