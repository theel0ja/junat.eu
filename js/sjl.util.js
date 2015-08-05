/* sjl.util.js */
Array.prototype.last = function () { return this[this.length - 1]; }

Array.prototype.first = function () { return this[0]; }

Array.prototype.union = function (b) {
  return function _union(a, b) {
    if (b.length == 0) return a;
    if (a.indexOf(b[0]) == -1)
      return _union(a.concat(b[0]), b.slice(1, b.length));
    return _union(a, b.slice(1, b.length));
  }(this, b);
}

Array.prototype.unique = function() {
    return this.reduce(function(accum, current) {
        if (accum.indexOf(current) < 0) {
            accum.push(current);
        }
        return accum;
    }, []);
}

function getTextWidth(text, font) {
    // re-use canvas object for better performance
    var canvas = getTextWidth.canvas ||
                 (getTextWidth.canvas = document.createElement("canvas"));
    var context = canvas.getContext("2d");
    context.font = font;
    var metrics = context.measureText(text);
    return metrics.width;
};

/* end of file. */
