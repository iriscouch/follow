# Traceback: easy access to the call stack, for Node.js

Writing a Node app? Need to know the function backtrace? Don't want to compile C++ code? Use Traceback.

Traceback provides a normal JavaScript array of the execution stack frames. You can see function names, line numbers, and other useful stuff.

Traceback is available from NPM.

    $ npm install traceback

## Example

**example.js**

```javascript
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
```

Output:

    I am last from file example.js
      1 above me: second at line 5
      2 above me: first at line 4
      3 above me: start at line 3

## Usage

Simply calling `traceback()` gives you the stack, with the current function in position 0.

Stack frame objects have normal V8 [CallSite][callsite] objects as prototypes. All those methods will work. You can also call `traceback.raw()` to get the exact stack made by V8.

But `traceback()`'s stack frame objects have convenient attribute names:

* **name** | The function name
* **path** | The absolute path of the file defining the function
* **file** | The basename of the `path` file (`"example.js"`)
* **line** | The line number in the file
* **col** | The column number in the file
* **pos** | The byte position in the file
* **fun** | The function itself
* **method** | If this function was called as a method, the name it is stored as
* **this** | The object bound to the label `this` in the function
* **type** | The type of `this`; the name of the constructor function (Object, ReadStream, etc.)
* **origin** | The `CallSite` that ran `eval()`, if this frame is an eval
* **is_top** | Boolean indicating whether the function was called with a global `this`
* **is_eval** | Boolean indicating whether the function comes from an `eval()` call
* **is_native** | Boolean indicating whether the function is native
* **is_ctor** | Boolean indicating whether this is a constructor (`new`) call

They also work correctly in `JSON.stringify()`.

## Tests

Tests use [node-tap][tap]. If you clone this Git repository, tap is included.

    $ tap test
    ok test/api.js ...................................... 286/286
    ok test/fail.js ....................................... 35/35
    ok test/format.js ....................................... 6/6
    ok test/readme.js ....................................... 1/1
    total ............................................... 332/332

    ok

## License

Apache 2.0

[callsite]: http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
[tap]: https://github.com/isaacs/node-tap
