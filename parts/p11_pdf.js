/* ================= PDF file export (no dependencies) =================
   Installed home-screen apps on iPhone have no print dialog — window.print() does nothing there —
   so "Save as PDF" builds a real PDF in the browser (A4, Helvetica, one record per page) and hands
   it to the share sheet (Save to Files, AirDrop, Mail) or, on a computer, downloads it. */
var PDF_W = 595.28, PDF_H = 841.89, PDF_ML = 46, PDF_MR = 46, PDF_MT = 50, PDF_MB = 54;
var PDF_CW = PDF_W - PDF_ML - PDF_MR;
/* glyph widths (1/1000 em) for codes 32–126: F1 Helvetica, F2 Helvetica-Bold (standard AFM) */
var PDF_AFM = {
  F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
  F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]
};
/* Unicode → WinAnsi for the punctuation people actually type */
var PDF_MAP = { 0x2013:150, 0x2014:151, 0x2018:145, 0x2019:146, 0x201C:147, 0x201D:148, 0x2022:149, 0x2026:133, 0x20AC:128, 0x2122:153,
  0x2030:137, 0x0160:138, 0x0161:154, 0x017D:142, 0x017E:158, 0x0152:140, 0x0153:156, 0x0178:159, 0x2039:139, 0x203A:155, 0x201A:130, 0x201E:132, 0x2020:134, 0x2021:135, 0x02C6:136, 0x02DC:152, 0x0192:131 };
/* JS string → WinAnsi byte string; newlines kept, tabs → space, anything unencodable (emoji) → ? */
function pdfEnc(s){
  var out = '';
  s = s == null ? '' : String(s);
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) { i++; out += '?'; continue; }
    if (c === 10) { out += '\n'; continue; }
    if (c === 9) { out += ' '; continue; }
    if (c < 32) continue;
    if (c < 127) { out += String.fromCharCode(c); continue; }
    if (PDF_MAP[c]) { out += String.fromCharCode(PDF_MAP[c]); continue; }
    out += (c >= 0xA0 && c <= 0xFF) ? String.fromCharCode(c) : '?';
  }
  return out;
}
function pdfEsc(b){ return b.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function pdfTextW(b, font, size){
  var w = 0, t = PDF_AFM[font];
  for (var i = 0; i < b.length; i++) { var c = b.charCodeAt(i); w += (c >= 32 && c <= 126) ? t[c - 32] : (font === 'F2' ? 611 : 556); }
  return w * size / 1000;
}
/* word-wrap an (unencoded) string into encoded lines; blank lines are kept, over-long words are split */
function pdfWrap(s, font, size, maxW){
  var lines = [];
  pdfEnc(s).split('\n').forEach(function(par){
    if (!par.trim()) { lines.push(''); return; }
    var line = '';
    par.split(/ +/).forEach(function(w){
      if (!w) return;
      if (pdfTextW(w, font, size) > maxW) {
        if (line) { lines.push(line); line = ''; }
        while (pdfTextW(w, font, size) > maxW && w.length > 1) {
          var n = w.length;
          while (n > 1 && pdfTextW(w.slice(0, n), font, size) > maxW) n--;
          lines.push(w.slice(0, n)); w = w.slice(n);
        }
        line = w; return;
      }
      var t = line ? line + ' ' + w : w;
      if (pdfTextW(t, font, size) <= maxW) line = t; else { lines.push(line); line = w; }
    });
    lines.push(line);
  });
  return lines;
}
function pdfN(n){ return String(Math.round(n * 100) / 100); }

function PdfDoc(title){ this.pages = []; this.title = title || ''; this.ops = null; this.y = 0; this.newPage(); }
PdfDoc.prototype.newPage = function(){ this.ops = []; this.pages.push(this.ops); this.y = PDF_MT; };
PdfDoc.prototype.ensure = function(h){ if (this.y + h > PDF_H - PDF_MB) this.newPage(); };
/* yTop is the top of the line box (page coordinates from the top, like CSS) */
PdfDoc.prototype.text = function(x, yTop, b, font, size, rgb){
  this.ops.push('BT /' + font + ' ' + pdfN(size) + ' Tf ' + rgb + ' rg 1 0 0 1 ' + pdfN(x) + ' ' + pdfN(PDF_H - yTop - size * 0.8) + ' Tm (' + pdfEsc(b) + ') Tj ET');
};
PdfDoc.prototype.line = function(x1, y1, x2, y2, w, rgb){
  this.ops.push(rgb + ' RG ' + pdfN(w) + ' w ' + pdfN(x1) + ' ' + pdfN(PDF_H - y1) + ' m ' + pdfN(x2) + ' ' + pdfN(PDF_H - y2) + ' l S');
};
PdfDoc.prototype.rect = function(x, yTop, w, h, rgb){
  this.ops.push(rgb + ' rg ' + pdfN(x) + ' ' + pdfN(PDF_H - yTop - h) + ' ' + pdfN(w) + ' ' + pdfN(h) + ' re f');
};
/* a wrapped paragraph that flows onto the next page when it has to */
PdfDoc.prototype.para = function(s, font, size, rgb, x, maxW, lineH, align){
  var self = this;
  pdfWrap(s, font, size, maxW).forEach(function(line){
    self.ensure(lineH);
    if (line) self.text(align === 'right' ? x + maxW - pdfTextW(line, font, size) : x, self.y, line, font, size, rgb);
    self.y += lineH;
  });
};
/* label | value columns that flow together, line by line, with a hairline on top */
PdfDoc.prototype.cols = function(a, b, lineH, rule){
  var la = pdfWrap(a.s, a.font, a.size, a.w), lb = pdfWrap(b.s, b.font, b.size, b.w), n = Math.max(la.length, lb.length, 1);
  this.ensure(Math.min(n, 2) * lineH + 8);
  if (rule) this.line(a.x, this.y, b.x + b.w, this.y, 0.5, rule);
  this.y += 4;
  for (var i = 0; i < n; i++) {
    this.ensure(lineH);
    if (la[i]) this.text(a.x, this.y, la[i], a.font, a.size, a.rgb);
    if (lb[i]) this.text(b.align === 'right' ? b.x + b.w - pdfTextW(lb[i], b.font, b.size) : b.x, this.y, lb[i], b.font, b.size, b.rgb);
    this.y += lineH;
  }
  this.y += 4;
};
/* running footer on every page: left text, "Page n of N" right */
PdfDoc.prototype.footers = function(left, rgb, ruleRgb){
  var N = this.pages.length, self = this;
  this.pages.forEach(function(ops, i){
    var keep = self.ops; self.ops = ops;
    var y = PDF_H - PDF_MB + 14;
    self.line(PDF_ML, y - 6, PDF_W - PDF_MR, y - 6, 0.5, ruleRgb);
    self.text(PDF_ML, y, pdfEnc(left), 'F1', 8.5, rgb);
    var pg = 'Page ' + (i + 1) + ' of ' + N;
    self.text(PDF_W - PDF_MR - pdfTextW(pg, 'F1', 8.5), y, pg, 'F1', 8.5, rgb);
    self.ops = keep;
  });
};
/* serialise: catalog, pages, two standard fonts, info, then a content + page object per page */
PdfDoc.prototype.build = function(){
  var objs = [], kids = [];
  function add(s){ objs.push(s); return objs.length; }
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');   // 2: pages, filled in below
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  add('<< /Producer (Astar Care) /Title (' + pdfEsc(pdfEnc(this.title)) + ') >>');
  this.pages.forEach(function(ops){
    var content = ops.join('\n');
    var c = add('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    kids.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pdfN(PDF_W) + ' ' + pdfN(PDF_H) + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + c + ' 0 R >>') + ' 0 R');
  });
  objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + this.pages.length + ' >>';
  var out = '%PDF-1.4\n%âãÏÓ\n', offs = [];
  objs.forEach(function(o, i){ offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  var xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offs.forEach(function(o){ out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  var bytes = new Uint8Array(out.length);
  for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
};

/* ---------- the export document (from xpCompose) as a PDF ---------- */
var PDF_INK = '0.09 0.17 0.3', PDF_MUT = '0.28 0.33 0.41', PDF_ACC = '0.08 0.37 0.39', PDF_WARN = '0.54 0.35 0', PDF_LINE = '0.84 0.87 0.9', PDF_PAPER = '0.96 0.97 0.98';
/* the same heading / paragraph split as renderNoteBody, as data */
function noteBlocks(body){
  var out = [], para = [];
  function flush(){ if (para.length) { out.push({ p: para.join('\n') }); para = []; } }
  (body || '').split('\n').forEach(function(raw){
    var line = raw.replace(/\*\*/g, '').trim();
    if (!line) { flush(); return; }
    if (isNoteHeading(raw)) { flush(); out.push({ h: line }); } else para.push(line);
  });
  flush();
  return out;
}
/* bordered label | value table (cover meta, care-log and overnight figures) */
function pdfTable(d, rows, x, w, labelW, valueAlign){
  d.line(x, d.y, x + w, d.y, 0.6, PDF_LINE);
  rows.forEach(function(r){
    var la = pdfWrap(r[0], 'F1', 10, labelW - 16), lb = pdfWrap(r[1], 'F1', 10, w - labelW - 16), n = Math.max(la.length, lb.length, 1), h = n * 14 + 10;
    d.ensure(h);
    d.rect(x, d.y, labelW, h, PDF_PAPER);
    d.line(x, d.y, x, d.y + h, 0.6, PDF_LINE); d.line(x + labelW, d.y, x + labelW, d.y + h, 0.6, PDF_LINE); d.line(x + w, d.y, x + w, d.y + h, 0.6, PDF_LINE);
    var y = d.y + 5;
    for (var i = 0; i < n; i++) {
      if (la[i]) d.text(x + 8, y, la[i], 'F1', 10, PDF_MUT);
      if (lb[i]) d.text(valueAlign === 'right' ? x + w - 8 - pdfTextW(lb[i], 'F1', 10) : x + labelW + 8, y, lb[i], 'F1', 10, PDF_INK);
      y += 14;
    }
    d.y += h;
    d.line(x, d.y, x + w, d.y, 0.6, PDF_LINE);
  });
}
function xpRenderPdf(C){
  var d = new PdfDoc(C.title + ' - ' + C.participant), L = PDF_ML, W = PDF_CW;
  /* cover */
  d.y = PDF_MT + 70;
  d.para(C.org.toUpperCase(), 'F2', 9.5, PDF_ACC, L, W, 14);
  d.y += 8;
  d.para(C.title, 'F2', 24, PDF_INK, L, W, 30);
  d.para(C.participant, 'F2', 16, PDF_INK, L, W, 22);
  d.para(C.period, 'F1', 11.5, PDF_MUT, L, W, 16);
  d.y += 14;
  pdfTable(d, C.meta, L, W, W * 0.28);
  d.y += 18;
  if (C.dates) { d.para('Dates covered', 'F2', 9.5, PDF_MUT, L, W, 14); d.y += 2; d.para(C.dates, 'F1', 10, PDF_INK, L, W, 15); }
  else d.para(C.none, 'F1', 10, PDF_MUT, L, W, 15);
  /* one page per record */
  C.records.forEach(function(r){
    d.newPage();
    d.para(r.date, 'F2', 15, PDF_INK, L, W, 20);
    d.para(r.meta, 'F1', 10, PDF_MUT, L, W, 14);
    d.y += 6; d.line(L, d.y, L + W, d.y, 0.8, PDF_LINE); d.y += 12;
    var m = r.rec;
    d.para(m.head, 'F2', 10, (m.cls === 'xp-ir' || m.cls === 'xp-nm') ? PDF_WARN : PDF_ACC, L, W, 14);
    d.y += 4;
    if (m.kind === 'note') {
      noteBlocks(m.body).forEach(function(b){
        if (b.h) { d.y += 6; d.para(b.h, 'F2', 10.5, PDF_INK, L, W, 15); d.y += 1; }
        else { d.para(b.p, 'F1', 10.5, PDF_INK, L, W, 15.5); d.y += 6; }
      });
    } else if (m.kind === 'rows') {
      var lw = W * 0.4;
      m.rows.forEach(function(row){
        d.cols({ s: row[0], font: 'F2', size: 9.5, rgb: PDF_MUT, x: L, w: lw - 10 }, { s: xpVal(row[1]), font: 'F1', size: 9.5, rgb: PDF_INK, x: L + lw, w: W - lw }, 13.5, PDF_LINE);
      });
    } else {
      var tw = Math.min(W, 380);
      pdfTable(d, m.rows.map(function(row){ return [row[0], String(row[1])]; }), L, tw, tw * 0.72, 'right');
    }
  });
  d.footers(C.org + ' · ' + C.title + ' · ' + C.participant, PDF_MUT, PDF_LINE);
  return d.build();
}

/* ---------- hand the file over: share sheet on phones, download elsewhere ---------- */
function xpStandalone(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
function xpDownload(blob, name){
  var url = URL.createObjectURL(blob);
  var a = el('a', { href: url, download: name, style: 'display:none' });
  document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 60000);
  toast('PDF saved — ' + name);
}
function xpSavePdf(){
  var C, bytes;
  try { C = xpCompose(); bytes = xpRenderPdf(C); }
  catch (e) { toast('Could not build the PDF: ' + e.message, true); return; }
  var blob = new Blob([bytes], { type: 'application/pdf' }), file = null;
  try { file = new File([bytes], C.fileName, { type: 'application/pdf' }); } catch (e) {}
  if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    // must run inside the tap (iOS user-activation rule) — the PDF is built synchronously above
    navigator.share({ files: [file], title: C.fileName })["catch"](function(e){ if (!e || e.name !== 'AbortError') xpDownload(blob, C.fileName); });
    return;
  }
  xpDownload(blob, C.fileName);
}
