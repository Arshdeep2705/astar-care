/* Shift-note template invariant check.
   Extracts NOTE_TEMPLATE and NOTE_HEADS from parts/p2_core.js and compares them with the
   frozen baseline captured from the `classic` tag (tests/template_baseline.json).
   Run:  node tests/check_template.js          (exit 1 on any drift)
         node tests/check_template.js --write  (only to capture the baseline from the classic
                                                 source — never to "fix" a failure) */
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var root = path.join(__dirname, '..');
var src = fs.readFileSync(path.join(root, 'parts', 'p2_core.js'), 'utf8');

function grabArray(name){
  var start = src.indexOf('var ' + name + ' = [');
  if (start < 0) throw new Error(name + ' not found');
  var open = src.indexOf('[', start);
  var depth = 0, i = open;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) break; }
  }
  var literal = src.slice(open, i + 1);
  var tail = src.slice(i + 1, i + 20);
  var arr = new Function('return ' + literal)();
  return /^\.join\('\\n'\)/.test(tail) ? arr.join('\n') : arr;
}

var tpl = grabArray('NOTE_TEMPLATE'), heads = grabArray('NOTE_HEADS');
var cur = { sha256: crypto.createHash('sha256').update(tpl, 'utf8').digest('hex'), lines: tpl.split('\n').length, headings: heads, template: tpl };
var basePath = path.join(__dirname, 'template_baseline.json');
if (process.argv.indexOf('--write') >= 0) {
  fs.writeFileSync(basePath, JSON.stringify(cur, null, 2));
  console.log('baseline written ' + cur.sha256 + ' (' + cur.lines + ' lines)');
  process.exit(0);
}
var base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
var tplOk = base.sha256 === cur.sha256 && base.template === cur.template;
var headsOk = JSON.stringify(base.headings) === JSON.stringify(cur.headings);
/* the editor must still hand the untouched constant to the textarea */
var p5 = fs.readFileSync(path.join(root, 'parts', 'p5_note_incident.js'), 'utf8');
var insertOk = p5.indexOf("typeSel.value === 'Progress Notes' ? NOTE_TEMPLATE : ''") >= 0 && (p5.match(/NOTE_TEMPLATE/g) || []).length >= 3;
console.log('NOTE_TEMPLATE  sha256 ' + cur.sha256 + '  ' + (tplOk ? 'matches baseline  PASS' : 'DIFFERS FROM BASELINE  FAIL'));
console.log('NOTE_HEADS     ' + (headsOk ? 'unchanged  PASS' : 'CHANGED  FAIL'));
console.log('editor insertion path uses NOTE_TEMPLATE unchanged  ' + (insertOk ? 'PASS' : 'FAIL'));
process.exit(tplOk && headsOk && insertOk ? 0 : 1);
