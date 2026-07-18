/**
 * AETHER safe math — no eval()
 * Prefer mathjs when available; fall back to a restricted expression evaluator.
 */
(function (g) {
  'use strict';

  // Only allow safe characters for the fallback parser
  var SAFE_RE = /^[\d\s+\-*/%().,eE^!]+$/;

  function withMathjs(expr) {
    if (typeof g.math !== 'undefined' && g.math && typeof g.math.evaluate === 'function') {
      var result = g.math.evaluate(expr);
      if (result && typeof result === 'object' && typeof result.toString === 'function') {
        return result.toString();
      }
      return String(result);
    }
    return null;
  }

  /**
   * Evaluate a math expression safely.
   * @param {string} expr
   * @returns {string}
   */
  function safeCalculate(expr) {
    try {
      expr = String(expr == null ? '' : expr).trim();
      if (!expr) return 'Error: empty expression';

      var viaMath = withMathjs(expr);
      if (viaMath !== null) return viaMath;

      // Fallback: very restricted arithmetic only
      if (!SAFE_RE.test(expr)) {
        return 'Error: expression contains unsupported characters (mathjs unavailable)';
      }
      // Replace ^ with ** for exponent if needed — avoid Function constructor for safety
      // Use a tiny recursive-descent style via new Function is still code injection risk.
      // Instead: only allow digit ops via a manual stack evaluator.
      return stackEval(expr);
    } catch (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e));
    }
  }

  function stackEval(input) {
    // Tokenize numbers and operators
    var tokens = [];
    var i = 0;
    var s = input.replace(/\s+/g, '').replace(/\^/g, '**');
    // Convert ** to a single op marker for simplicity — use ^ internally
    s = s.replace(/\*\*/g, '^');

    while (i < s.length) {
      var c = s[i];
      if ((c >= '0' && c <= '9') || c === '.') {
        var j = i + 1;
        while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.' || s[j] === 'e' || s[j] === 'E')) {
          if ((s[j] === 'e' || s[j] === 'E') && (s[j + 1] === '+' || s[j + 1] === '-')) j += 2;
          else j++;
        }
        tokens.push({ t: 'n', v: parseFloat(s.slice(i, j)) });
        i = j;
        continue;
      }
      if ('+-*/%^()'.indexOf(c) >= 0) {
        tokens.push({ t: 'o', v: c });
        i++;
        continue;
      }
      if (c === '!') {
        tokens.push({ t: 'o', v: '!' });
        i++;
        continue;
      }
      throw new Error('bad token: ' + c);
    }

    // Shunting-yard → RPN
    var prec = { '!': 4, '^': 3, '*': 2, '/': 2, '%': 2, '+': 1, '-': 1 };
    var rightAssoc = { '^': 1, '!': 1 };
    var out = [];
    var ops = [];
    var prevWasOp = true;

    for (var k = 0; k < tokens.length; k++) {
      var tok = tokens[k];
      if (tok.t === 'n') {
        out.push(tok);
        prevWasOp = false;
      } else if (tok.v === '(') {
        ops.push(tok);
        prevWasOp = true;
      } else if (tok.v === ')') {
        while (ops.length && ops[ops.length - 1].v !== '(') out.push(ops.pop());
        if (!ops.length) throw new Error('mismatched parentheses');
        ops.pop();
        prevWasOp = false;
      } else {
        // unary minus
        if (tok.v === '-' && prevWasOp) {
          out.push({ t: 'n', v: 0 });
        }
        while (
          ops.length &&
          ops[ops.length - 1].v !== '(' &&
          (prec[ops[ops.length - 1].v] > prec[tok.v] ||
            (prec[ops[ops.length - 1].v] === prec[tok.v] && !rightAssoc[tok.v]))
        ) {
          out.push(ops.pop());
        }
        ops.push(tok);
        prevWasOp = true;
      }
    }
    while (ops.length) {
      var o = ops.pop();
      if (o.v === '(' || o.v === ')') throw new Error('mismatched parentheses');
      out.push(o);
    }

    var st = [];
    for (var r = 0; r < out.length; r++) {
      var t = out[r];
      if (t.t === 'n') st.push(t.v);
      else if (t.v === '!') {
        var n = st.pop();
        if (n < 0 || n !== Math.floor(n) || n > 170) throw new Error('factorial domain');
        var f = 1;
        for (var x = 2; x <= n; x++) f *= x;
        st.push(f);
      } else {
        var b = st.pop();
        var a = st.pop();
        switch (t.v) {
          case '+': st.push(a + b); break;
          case '-': st.push(a - b); break;
          case '*': st.push(a * b); break;
          case '/': st.push(a / b); break;
          case '%': st.push(a % b); break;
          case '^': st.push(Math.pow(a, b)); break;
          default: throw new Error('unknown op');
        }
      }
    }
    if (st.length !== 1 || !isFinite(st[0])) throw new Error('invalid expression');
    return String(st[0]);
  }

  g.AETHER_safeCalculate = safeCalculate;
})(typeof globalThis !== 'undefined' ? globalThis : window);
