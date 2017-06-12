/**
 * Encoding.js
 *
 * @description    Converts character encoding.
 * @fileoverview   Encoding library
 * @author         polygon planet
 * @version        1.0.25
 * @date           2016-11-03
 * @link           https://github.com/polygonplanet/encoding.js
 * @copyright      Copyright (c) 2013-2016 polygon planet <polygon.planet.aqua@gmail.com>
 * @license        licensed under the MIT license.
 *
 * Based:
 *   - mbstring library
 *   - posql charset library
 *   - libxml2
 *   - pot.js
 */

/*jshint bitwise:false,eqnull:true,newcap:false */

(function (name, context, factory) {

// Supports UMD. AMD, CommonJS/Node.js and browser context
if (typeof exports !== 'undefined') {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    exports[name] = factory();
  }
} else if (typeof define === 'function' && define.amd) {
  define(factory);
} else {
  context[name] = factory();
}

})('Encoding', this, function () {
'use strict';

var UTF8_UNKNOWN = '?'.charCodeAt(0);

var fromCharCode = String.fromCharCode;
var slice = Array.prototype.slice;
var toString = Object.prototype.toString;
var hasOwnProperty = Object.prototype.hasOwnProperty;

var HAS_TYPED = typeof Uint8Array !== 'undefined' &&
                typeof Uint16Array !== 'undefined';

// Test for String.fromCharCode.apply.
var CAN_CHARCODE_APPLY = false;
var CAN_CHARCODE_APPLY_TYPED = false;

try {
  if (fromCharCode.apply(null, [0x61]) === 'a') {
    CAN_CHARCODE_APPLY = true;
  }
} catch (e) {}

if (HAS_TYPED) {
  try {
    if (fromCharCode.apply(null, new Uint8Array([0x61])) === 'a') {
      CAN_CHARCODE_APPLY_TYPED = true;
    }
  } catch (e) {}
}

// Function.prototype.apply stack max range
var APPLY_BUFFER_SIZE = 65533;
var APPLY_BUFFER_SIZE_OK = null;


/**
 * Encoding names.
 *
 * @ignore
 */
var EncodingNames = {
  UTF32: {
    order: 0
  },
  UTF32BE: {
    alias: ['UCS4']
  },
  UTF32LE: null,
  UTF16: {
    order: 1
  },
  UTF16BE: {
    alias: ['UCS2']
  },
  UTF16LE: null,
  BINARY: {
    order: 2
  },
  ASCII: {
    order: 3,
    alias: ['ISO646', 'CP367']
  },
  JIS: {
    order: 4,
    alias: ['ISO2022JP']
  },
  UTF8: {
    order: 5
  },
  EUCJP: {
    order: 6
  },
  SJIS: {
    order: 7,
    alias: ['CP932', 'MSKANJI', 'WINDOWS31J']
  },
  UNICODE: {
    order: 8
  }
};

/**
 * Encoding alias names.
 *
 * @ignore
 */
var EncodingAliases = {};

/**
 * Encoding orders.
 *
 * @ignore
 */
var EncodingOrders = (function() {
  var aliases = EncodingAliases;

  var names = getKeys(EncodingNames);
  var orders = [];
  var name, encoding, j, l;

  for (var i = 0, len = names.length; i < len; i++) {
    name = names[i];
    aliases[name] = name;

    encoding = EncodingNames[name];
    if (encoding != null) {
      if (typeof encoding.order !== 'undefined') {
        orders[orders.length] = name;
      }

      if (encoding.alias) {
        // Create the encoding aliases.
        for (j = 0, l = encoding.alias.length; j < l; j++) {
          aliases[encoding.alias[j]] = name;
        }
      }
    }
  }

  orders.sort(function(a, b) {
    return EncodingNames[a].order - EncodingNames[b].order;
  });

  return orders;
}());


/**
 * Encoding.
 *
 * @name Encoding
 * @type {Object}
 * @public
 * @class
 */
var Encoding = {
  /**
   * @lends Encoding
   */
  /**
   * Encoding orders.
   *
   * @ignore
   */
  orders: EncodingOrders,
  /**
   * Detects character encoding.
   *
   * If encodings is "AUTO", or the encoding-list as an array, or
   *   comma separated list string it will be detected automatically.
   *
   * @param {Array.<number>|TypedArray|string} data The data being detected.
   * @param {(Object|string|Array.<string>)=} [encodings] The encoding-list of
   *   character encoding.
   * @return {string|boolean} The detected character encoding, or false.
   *
   * @public
   * @function
   */
  detect: function(data, encodings) {
    if (data == null || data.length === 0) {
      return false;
    }

    if (isObject(encodings) && !isArray(encodings)) {
      encodings = encodings.encoding;
    }

    if (isString(data)) {
      data = stringToBuffer(data);
    }

    if (encodings == null) {
      encodings = Encoding.orders;
    } else {
      if (isString(encodings)) {
        encodings = encodings.toUpperCase();
        if (encodings === 'AUTO') {
          encodings = Encoding.orders;
        } else if (~encodings.indexOf(',')) {
          encodings = encodings.split(/\s*,\s*/);
        } else {
          encodings = [encodings];
        }
      }
    }

    var len = encodings.length;
    var e, encoding, method;
    for (var i = 0; i < len; i++) {
      e = encodings[i];
      encoding = assignEncodingName(e);
      if (!encoding) {
        continue;
      }

      method = 'is' + encoding;
      if (!hasOwnProperty.call(EncodingDetect, method)) {
        throw new Error('Undefined encoding: ' + e);
      }

      if (EncodingDetect[method](data)) {
        return encoding;
      }
    }

    return false;
  },
  /**
   * Convert character encoding.
   *
   * If `from` is "AUTO", or the encoding-list as an array, or
   *   comma separated list string it will be detected automatically.
   *
   * @param {Array.<number>|TypedArray|string} data The data being converted.
   * @param {(string|Object)} to The name of encoding to.
   * @param {(string|Array.<string>)=} [from] The encoding-list of
   *   character encoding.
   * @return {Array|TypedArray|string} The converted data.
   *
   * @public
   * @function
   */
  convert: function(data, to, from) {
    var result;
    var type;
    var options = {};

    if (isObject(to)) {
      options = to;
      from = options.from;
      to = options.to;
      if (options.type) {
        type = options.type;
      }
    }

    if (isString(data)) {
      type = type || 'string';
      data = stringToBuffer(data);
    } else if (data == null || data.length === 0) {
      data = [];
    }

    var encodingFrom;
    if (from != null && isString(from) &&
        from.toUpperCase() !== 'AUTO' && !~from.indexOf(',')) {
      encodingFrom = assignEncodingName(from);
    } else {
      encodingFrom = Encoding.detect(data);
    }

    var encodingTo = assignEncodingName(to);
    var method = encodingFrom + 'To' + encodingTo;

    if (hasOwnProperty.call(EncodingConvert, method)) {
      result = EncodingConvert[method](data, options);
    } else {
      // Returns the raw data if the method is undefined.
      result = data;
    }

    switch (('' + type).toLowerCase()) {
      case 'string':
        return codeToString_fast(result);
      case 'arraybuffer':
        return codeToBuffer(result);
      case 'array':
        /* falls through */
      default:
        return bufferToCode(result);
    }
  },
  /**
   * Encode a character code array to URL string like encodeURIComponent.
   *
   * @param {Array.<number>|TypedArray} data The data being encoded.
   * @return {string} The percent encoded string.
   *
   * @public
   * @function
   */
  urlEncode: function(data) {
    if (isString(data)) {
      data = stringToBuffer(data);
    }

    var alpha = stringToCode('0123456789ABCDEF');
    var results = [];
    var i = 0;
    var len = data && data.length;
    var b;

    for (; i < len; i++) {
      b = data[i];

      //FIXME: JavaScript UTF-16 encoding
      if (b > 0xFF) {
        return encodeURIComponent(codeToString_fast(data));
      }

      if ((b >= 0x61 /*a*/ && b <= 0x7A /*z*/) ||
          (b >= 0x41 /*A*/ && b <= 0x5A /*Z*/) ||
          (b >= 0x30 /*0*/ && b <= 0x39 /*9*/) ||
          b === 0x21 /*!*/ ||
          (b >= 0x27 /*'*/ && b <= 0x2A /***/) ||
          b === 0x2D /*-*/ || b === 0x2E /*.*/ ||
          b === 0x5F /*_*/ || b === 0x7E /*~*/
      ) {
        results[results.length] = b;
      } else {
        results[results.length] = 0x25; /*%*/
        if (b < 0x10) {
          results[results.length] = 0x30; /*0*/
          results[results.length] = alpha[b];
        } else {
          results[results.length] = alpha[b >> 4 & 0xF];
          results[results.length] = alpha[b & 0xF];
        }
      }
    }

    return codeToString_fast(results);
  },
  /**
   * Decode a percent encoded string to
   *  character code array like decodeURIComponent.
   *
   * @param {string} string The data being decoded.
   * @return {Array.<number>} The decoded array.
   *
   * @public
   * @function
   */
  urlDecode: function(string) {
    var results = [];
    var i = 0;
    var len = string && string.length;
    var c;

    while (i < len) {
      c = string.charCodeAt(i++);
      if (c === 0x25 /*%*/) {
        results[results.length] = parseInt(
          string.charAt(i++) + string.charAt(i++), 16);
      } else {
        results[results.length] = c;
      }
    }

    return results;
  },
  /**
   * Encode a character code array to Base64 encoded string.
   *
   * @param {Array.<number>|TypedArray} data The data being encoded.
   * @return {string} The Base64 encoded string.
   *
   * @public
   * @function
   */
  base64Encode: function(data) {
    if (isString(data)) {
      data = stringToBuffer(data);
    }
    return base64encode(data);
  },
  /**
   * Decode a Base64 encoded string to character code array.
   *
   * @param {string} string The data being decoded.
   * @return {Array.<number>} The decoded array.
   *
   * @public
   * @function
   */
  base64Decode: function(string) {
    return base64decode(string);
  },
  /**
   * Joins a character code array to string.
   *
   * @param {Array.<number>|TypedArray} data The data being joined.
   * @return {String} The joined string.
   *
   * @public
   * @function
   */
  codeToString: codeToString_fast,
  /**
   * Splits string to an array of character codes.
   *
   * @param {string} string The input string.
   * @return {Array.<number>} The character code array.
   *
   * @public
   * @function
   */
  stringToCode: stringToCode
};


/**
 * @private
 * @ignore
 */
var EncodingDetect = {
  isBINARY: isBINARY,
  isASCII: isASCII,
  isUTF8: isUTF8,
  isUTF16: isUTF16,
  isUTF16BE: isUTF16BE,
  isUTF16LE: isUTF16LE,
  isUTF32: isUTF32,
  isUNICODE: isUNICODE
};

/**
 * @private
 * @ignore
 */
var EncodingConvert = {


  // UTF8

  // UNICODE
  UNICODEToUTF8: UNICODEToUTF8,
  UTF8ToUNICODE: UTF8ToUNICODE,

  // UTF16, UNICODE
  UNICODEToUTF16: UNICODEToUTF16,
  UTF16ToUNICODE: UTF16ToUNICODE,
  UNICODEToUTF16BE: UNICODEToUTF16BE,
  UTF16BEToUNICODE: UTF16BEToUNICODE,
  UNICODEToUTF16LE: UNICODEToUTF16LE,
  UTF16LEToUNICODE: UTF16LEToUNICODE,

  // UTF16, UTF16BE, UTF16LE
  UTF8ToUTF16: UTF8ToUTF16,
  UTF16ToUTF8: UTF16ToUTF8,
  UTF8ToUTF16BE: UTF8ToUTF16BE,
  UTF16BEToUTF8: UTF16BEToUTF8,
  UTF8ToUTF16LE: UTF8ToUTF16LE,
  UTF16LEToUTF8: UTF16LEToUTF8,
  UTF16ToUTF16BE: UTF16ToUTF16BE,
  UTF16BEToUTF16: UTF16BEToUTF16,
  UTF16ToUTF16LE: UTF16ToUTF16LE,
  UTF16LEToUTF16: UTF16LEToUTF16,
  UTF16BEToUTF16LE: UTF16BEToUTF16LE,
  UTF16LEToUTF16BE: UTF16LEToUTF16BE
};


/**
 * Binary (exe, images and so, etc.)
 *
 * Note:
 *   This function is not considered for Unicode
 *
 * @private
 * @ignore
 */
function isBINARY(data) {
  var i = 0;
  var len = data && data.length;
  var c;

  for (; i < len; i++) {
    c = data[i];
    if (c > 0xFF) {
      return false;
    }

    if ((c >= 0x00 && c <= 0x07) || c === 0xFF) {
      return true;
    }
  }

  return false;
}

/**
 * ASCII (ISO-646)
 *
 * @private
 * @ignore
 */
function isASCII(data) {
  var i = 0;
  var len = data && data.length;
  var b;

  for (; i < len; i++) {
    b = data[i];
    if (b > 0xFF ||
        (b >= 0x80 && b <= 0xFF) ||
        b === 0x1B) {
      return false;
    }
  }

  return true;
}

/**
 * UTF-8
 *
 * @private
 * @ignore
 */
function isUTF8(data) {
  var i = 0;
  var len = data && data.length;
  var b;

  for (; i < len; i++) {
    b = data[i];
    if (b > 0xFF) {
      return false;
    }

    if (b === 0x09 || b === 0x0A || b === 0x0D ||
        (b >= 0x20 && b <= 0x7E)) {
      continue;
    }

    if (b >= 0xC2 && b <= 0xDF) {
      if (i + 1 >= len || data[i + 1] < 0x80 || data[i + 1] > 0xBF) {
        return false;
      }
      i++;
    } else if (b === 0xE0) {
      if (i + 2 >= len ||
          data[i + 1] < 0xA0 || data[i + 1] > 0xBF ||
          data[i + 2] < 0x80 || data[i + 2] > 0xBF) {
        return false;
      }
      i += 2;
    } else if ((b >= 0xE1 && b <= 0xEC) ||
                b === 0xEE || b === 0xEF) {
      if (i + 2 >= len ||
          data[i + 1] < 0x80 || data[i + 1] > 0xBF ||
          data[i + 2] < 0x80 || data[i + 2] > 0xBF) {
        return false;
      }
      i += 2;
    } else if (b === 0xED) {
      if (i + 2 >= len ||
          data[i + 1] < 0x80 || data[i + 1] > 0x9F ||
          data[i + 2] < 0x80 || data[i + 2] > 0xBF) {
        return false;
      }
      i += 2;
    } else if (b === 0xF0) {
      if (i + 3 >= len ||
          data[i + 1] < 0x90 || data[i + 1] > 0xBF ||
          data[i + 2] < 0x80 || data[i + 2] > 0xBF ||
          data[i + 3] < 0x80 || data[i + 3] > 0xBF) {
        return false;
      }
      i += 3;
    } else if (b >= 0xF1 && b <= 0xF3) {
      if (i + 3 >= len ||
          data[i + 1] < 0x80 || data[i + 1] > 0xBF ||
          data[i + 2] < 0x80 || data[i + 2] > 0xBF ||
          data[i + 3] < 0x80 || data[i + 3] > 0xBF) {
        return false;
      }
      i += 3;
    } else if (b === 0xF4) {
      if (i + 3 >= len ||
          data[i + 1] < 0x80 || data[i + 1] > 0x8F ||
          data[i + 2] < 0x80 || data[i + 2] > 0xBF ||
          data[i + 3] < 0x80 || data[i + 3] > 0xBF) {
        return false;
      }
      i += 3;
    } else {
      return false;
    }
  }

  return true;
}

/**
 * UTF-16 (LE or BE)
 *
 * RFC2781: UTF-16, an encoding of ISO 10646
 *
 * @link http://www.ietf.org/rfc/rfc2781.txt
 * @private
 * @ignore
 */
function isUTF16(data) {
  var i = 0;
  var len = data && data.length;
  var pos = null;
  var b1, b2, next, prev;

  if (len < 2) {
    if (data[0] > 0xFF) {
      return false;
    }
  } else {
    b1 = data[0];
    b2 = data[1];
    if (b1 === 0xFF && // BOM (little-endian)
        b2 === 0xFE) {
      return true;
    }
    if (b1 === 0xFE && // BOM (big-endian)
        b2 === 0xFF) {
      return true;
    }

    for (; i < len; i++) {
      if (data[i] === 0x00) {
        pos = i;
        break;
      } else if (data[i] > 0xFF) {
        return false;
      }
    }

    if (pos === null) {
      return false; // Non ASCII
    }

    next = data[pos + 1]; // BE
    if (next !== void 0 && next > 0x00 && next < 0x80) {
      return true;
    }

    prev = data[pos - 1]; // LE
    if (prev !== void 0 && prev > 0x00 && prev < 0x80) {
      return true;
    }
  }

  return false;
}

/**
 * UTF-16BE (big-endian)
 *
 * RFC 2781 4.3 Interpreting text labelled as UTF-16
 * Text labelled "UTF-16BE" can always be interpreted as being big-endian
 *  when BOM does not founds (SHOULD)
 *
 * @link http://www.ietf.org/rfc/rfc2781.txt
 * @private
 * @ignore
 */
function isUTF16BE(data) {
  var i = 0;
  var len = data && data.length;
  var pos = null;
  var b1, b2;

  if (len < 2) {
    if (data[0] > 0xFF) {
      return false;
    }
  } else {
    b1 = data[0];
    b2 = data[1];
    if (b1 === 0xFE && // BOM
        b2 === 0xFF) {
      return true;
    }

    for (; i < len; i++) {
      if (data[i] === 0x00) {
        pos = i;
        break;
      } else if (data[i] > 0xFF) {
        return false;
      }
    }

    if (pos === null) {
      return false; // Non ASCII
    }

    if (pos % 2 === 0) {
      return true;
    }
  }

  return false;
}

/**
 * UTF-16LE (little-endian)
 *
 * @see isUTF16BE
 * @private
 * @ignore
 */
function isUTF16LE(data) {
  var i = 0;
  var len = data && data.length;
  var pos = null;
  var b1, b2;

  if (len < 2) {
    if (data[0] > 0xFF) {
      return false;
    }
  } else {
    b1 = data[0];
    b2 = data[1];
    if (b1 === 0xFF && // BOM
        b2 === 0xFE) {
      return true;
    }

    for (; i < len; i++) {
      if (data[i] === 0x00) {
        pos = i;
        break;
      } else if (data[i] > 0xFF) {
        return false;
      }
    }

    if (pos === null) {
      return false; // Non ASCII
    }

    if (pos % 2 !== 0) {
      return true;
    }
  }

  return false;
}

/**
 * UTF-32
 *
 * Unicode 3.2.0: Unicode Standard Annex #19
 *
 * @link http://www.iana.org/assignments/charset-reg/UTF-32
 * @link http://www.unicode.org/reports/tr19/tr19-9.html
 * @private
 * @ignore
 */
function isUTF32(data) {
  var i = 0;
  var len = data && data.length;
  var pos = null;
  var b1, b2, b3, b4;
  var next, prev;

  if (len < 4) {
    for (; i < len; i++) {
      if (data[i] > 0xFF) {
        return false;
      }
    }
  } else {
    b1 = data[0];
    b2 = data[1];
    b3 = data[2];
    b4 = data[3];
    if (b1 === 0x00 && b2 === 0x00 && // BOM (big-endian)
        b3 === 0xFE && b4 === 0xFF) {
      return true;
    }

    if (b1 === 0xFF && b2 === 0xFE && // BOM (little-endian)
        b3 === 0x00 && b4 === 0x00) {
      return true;
    }

    for (; i < len; i++) {
      if (data[i] === 0x00 && data[i + 1] === 0x00 && data[i + 2] === 0x00) {
        pos = i;
        break;
      } else if (data[i] > 0xFF) {
        return false;
      }
    }

    if (pos === null) {
      return false;
    }

    // The byte order should be the big-endian when BOM is not detected.
    next = data[pos + 3];
    if (next !== void 0 && next > 0x00 && next <= 0x7F) {
      // big-endian
      return data[pos + 2] === 0x00 && data[pos + 1] === 0x00;
    }

    prev = data[pos - 1];
    if (prev !== void 0 && prev > 0x00 && prev <= 0x7F) {
      // little-endian
      return data[pos + 1] === 0x00 && data[pos + 2] === 0x00;
    }
  }

  return false;
}

/**
 * JavaScript Unicode array
 *
 * @private
 * @ignore
 */
function isUNICODE(data) {
  var i = 0;
  var len = data && data.length;
  var c;

  for (; i < len; i++) {
    c = data[i];
    if (c < 0 || c > 0x10FFFF) {
      return false;
    }
  }

  return true;
}

/**
 * UTF-16 (JavaScript Unicode array) to UTF-8
 *
 * @private
 * @ignore
 */
function UNICODEToUTF8(data) {
  var results = [];
  var i = 0;
  var len = data && data.length;
  var c, second;

  for (; i < len; i++) {
    c = data[i];

    // high surrogate
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < len) {
      second = data[i + 1];
      // low surrogate
      if (second >= 0xDC00 && second <= 0xDFFF) {
        c = (c - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
        i++;
      }
    }

    if (c < 0x80) {
      results[results.length] = c;
    } else if (c < 0x800) {
      results[results.length] = 0xC0 | ((c >> 6) & 0x1F);
      results[results.length] = 0x80 | (c & 0x3F);
    } else if (c < 0x10000) {
      results[results.length] = 0xE0 | ((c >> 12) & 0xF);
      results[results.length] = 0x80 | ((c >> 6) & 0x3F);
      results[results.length] = 0x80 | (c & 0x3F);
    } else if (c < 0x200000) {
      results[results.length] = 0xF0 | ((c >> 18) & 0xF);
      results[results.length] = 0x80 | ((c >> 12) & 0x3F);
      results[results.length] = 0x80 | ((c >> 6) & 0x3F);
      results[results.length] = 0x80 | (c & 0x3F);
    }
  }

  return results;
}

/**
 * UTF-8 to UTF-16 (JavaScript Unicode array)
 *
 * @private
 * @ignore
 */
function UTF8ToUNICODE(data) {
  var results = [];
  var i = 0;
  var len = data && data.length;
  var n, c, c2, c3, c4, code;

  while (i < len) {
    c = data[i++];
    n = c >> 4;
    if (n >= 0 && n <= 7) {
      // 0xxx xxxx
      code = c;
    } else if (n === 12 || n === 13) {
      // 110x xxxx
      // 10xx xxxx
      c2 = data[i++];
      code = ((c & 0x1F) << 6) | (c2 & 0x3F);
    } else if (n === 14) {
      // 1110 xxxx
      // 10xx xxxx
      // 10xx xxxx
      c2 = data[i++];
      c3 = data[i++];
      code = ((c & 0x0F) << 12) |
             ((c2 & 0x3F) << 6) |
              (c3 & 0x3F);
    } else if (n === 15) {
      // 1111 0xxx
      // 10xx xxxx
      // 10xx xxxx
      // 10xx xxxx
      c2 = data[i++];
      c3 = data[i++];
      c4 = data[i++];
      code = ((c & 0x7) << 18)   |
             ((c2 & 0x3F) << 12) |
             ((c3 & 0x3F) << 6)  |
              (c4 & 0x3F);
    }

    if (code <= 0xFFFF) {
      results[results.length] = code;
    } else {
      // Split in surrogate halves
      code -= 0x10000;
      results[results.length] = (code >> 10) + 0xD800; // High surrogate
      results[results.length] = (code % 0x400) + 0xDC00; // Low surrogate
    }
  }

  return results;
}

/**
 * UTF-16 (JavaScript Unicode array) to UTF-16
 *
 * UTF-16BE (big-endian)
 * Note: this function does not prepend the BOM by default.
 *
 * RFC 2781 4.3 Interpreting text labelled as UTF-16
 *   If the first two octets of the text is not 0xFE followed by
 *   0xFF, and is not 0xFF followed by 0xFE, then the text SHOULD be
 *   interpreted as being big-endian.
 *
 * @link https://www.ietf.org/rfc/rfc2781.txt
 * UTF-16, an encoding of ISO 10646
 *
 * @private
 * @ignore
 */
function UNICODEToUTF16(data, options) {
  var results;

  if (options && options.bom) {
    var optBom = options.bom;
    if (!isString(optBom)) {
      optBom = 'BE';
    }

    var bom, utf16;
    if (optBom.charAt(0).toUpperCase() === 'B') {
      // Big-endian
      bom = [0xFE, 0xFF];
      utf16 = UNICODEToUTF16BE(data);
    } else {
      // Little-endian
      bom = [0xFF, 0xFE];
      utf16 = UNICODEToUTF16LE(data);
    }

    results = [];
    results[0] = bom[0];
    results[1] = bom[1];

    for (var i = 0, len = utf16.length; i < len; i++) {
      results[results.length] = utf16[i];
    }
  } else {
    // Without BOM: Convert as BE (SHOULD).
    results = UNICODEToUTF16BE(data);
  }

  return results;
}

/**
 * UTF-16 (JavaScript Unicode array) to UTF-16BE
 *
 * @link https://www.ietf.org/rfc/rfc2781.txt
 * UTF-16, an encoding of ISO 10646
 *
 * @private
 * @ignore
 */
function UNICODEToUTF16BE(data) {
  var results = [];
  var i = 0;
  var len = data && data.length;
  var c;

  while (i < len) {
    c = data[i++];
    if (c <= 0xFF) {
      results[results.length] = 0;
      results[results.length] = c;
    } else if (c <= 0xFFFF) {
      results[results.length] = c >> 8 & 0xFF;
      results[results.length] = c & 0xFF;
    }
  }

  return results;
}

/**
 * UTF-16 (JavaScript Unicode array) to UTF-16LE
 *
 * @link https://www.ietf.org/rfc/rfc2781.txt
 * UTF-16, an encoding of ISO 10646
 *
 * @private
 * @ignore
 */
function UNICODEToUTF16LE(data) {
  var results = [];
  var i = 0;
  var len = data && data.length;
  var c;

  while (i < len) {
    c = data[i++];
    if (c <= 0xFF) {
      results[results.length] = c;
      results[results.length] = 0;
    } else if (c <= 0xFFFF) {
      results[results.length] = c & 0xFF;
      results[results.length] = c >> 8 & 0xFF;
    }
  }

  return results;
}

/**
 * UTF-16BE to UTF-16 (JavaScript Unicode array)
 *
 * @link https://www.ietf.org/rfc/rfc2781.txt
 * UTF-16, an encoding of ISO 10646
 *
 * @private
 * @ignore
 */
function UTF16BEToUNICODE(data) {
  var results = [];
  var i = 0;
  var len = data && data.length;
  var c1, c2;

  if (len >= 2 &&
      ((data[0] === 0xFE && data[1] === 0xFF) ||
       (data[0] === 0xFF && data[1] === 0xFE))
  ) {
    i = 2;
  }

  while (i < len) {
    c1 = data[i++];
    c2 = data[i++];
    if (c1 === 0) {
      results[results.length] = c2;
    } else {
      results[results.length] = ((c1 & 0xFF) << 8) | (c2 & 0xFF);
    }
  }

  return results;
}

/**
 * UTF-16LE to UTF-16 (JavaScript Unicode array)
 *
 * @link https://www.ietf.org/rfc/rfc2781.txt
 * UTF-16, an encoding of ISO 10646
 *
 * @private
 * @ignore
 */
function UTF16LEToUNICODE(data) {
  var results = [];
  var i = 0;
  var len = data && data.length;
  var c1, c2;

  if (len >= 2 &&
      ((data[0] === 0xFE && data[1] === 0xFF) ||
       (data[0] === 0xFF && data[1] === 0xFE))
  ) {
    i = 2;
  }

  while (i < len) {
    c1 = data[i++];
    c2 = data[i++];
    if (c2 === 0) {
      results[results.length] = c1;
    } else {
      results[results.length] = ((c2 & 0xFF) << 8) | (c1 & 0xFF);
    }
  }

  return results;
}

/**
 * UTF-16 to UTF-16 (JavaScript Unicode array)
 *
 * @link https://www.ietf.org/rfc/rfc2781.txt
 * UTF-16, an encoding of ISO 10646
 *
 * @private
 * @ignore
 */
function UTF16ToUNICODE(data) {
  var results = [];
  var i = 0;
  var len = data && data.length;
  var isLE = false;
  var first = true;
  var c1, c2;

  while (i < len) {
    c1 = data[i++];
    c2 = data[i++];

    if (first && i === 2) {
      first = false;
      if (c1 === 0xFE && c2 === 0xFF) {
        isLE = false;
      } else if (c1 === 0xFF && c2 === 0xFE) {
        // Little-endian
        isLE = true;
      } else {
        isLE = isUTF16LE(data);
        i = 0;
      }
      continue;
    }

    if (isLE) {
      if (c2 === 0) {
        results[results.length] = c1;
      } else {
        results[results.length] = ((c2 & 0xFF) << 8) | (c1 & 0xFF);
      }
    } else {
      if (c1 === 0) {
        results[results.length] = c2;
      } else {
        results[results.length] = ((c1 & 0xFF) << 8) | (c2 & 0xFF);
      }
    }
  }

  return results;
}

/**
 * UTF-16 to UTF-16BE
 *
 * @private
 * @ignore
 */
function UTF16ToUTF16BE(data) {
  var results = [];
  var i = 0;
  var len = data && data.length;
  var isLE = false;
  var first = true;
  var c1, c2;

  while (i < len) {
    c1 = data[i++];
    c2 = data[i++];

    if (first && i === 2) {
      first = false;
      if (c1 === 0xFE && c2 === 0xFF) {
        isLE = false;
      } else if (c1 === 0xFF && c2 === 0xFE) {
        // Little-endian
        isLE = true;
      } else {
        isLE = isUTF16LE(data);
        i = 0;
      }
      continue;
    }

    if (isLE) {
      results[results.length] = c2;
      results[results.length] = c1;
    } else {
      results[results.length] = c1;
      results[results.length] = c2;
    }
  }

  return results;
}

/**
 * UTF-16BE to UTF-16
 *
 * @private
 * @ignore
 */
function UTF16BEToUTF16(data, options) {
  var isLE = false;
  var bom;

  if (options && options.bom) {
    var optBom = options.bom;
    if (!isString(optBom)) {
      optBom = 'BE';
    }

    if (optBom.charAt(0).toUpperCase() === 'B') {
      // Big-endian
      bom = [0xFE, 0xFF];
    } else {
      // Little-endian
      bom = [0xFF, 0xFE];
      isLE = true;
    }
  }

  var results = [];
  var len = data && data.length;
  var i = 0;

  if (len >= 2 &&
      ((data[0] === 0xFE && data[1] === 0xFF) ||
       (data[0] === 0xFF && data[1] === 0xFE))
  ) {
    i = 2;
  }

  if (bom) {
    results[0] = bom[0];
    results[1] = bom[1];
  }

  var c1, c2;
  while (i < len) {
    c1 = data[i++];
    c2 = data[i++];

    if (isLE) {
      results[results.length] = c2;
      results[results.length] = c1;
    } else {
      results[results.length] = c1;
      results[results.length] = c2;
    }
  }

  return results;
}

/**
 * UTF-16 to UTF-16LE
 *
 * @private
 * @ignore
 */
function UTF16ToUTF16LE(data) {
  var results = [];
  var i = 0;
  var len = data && data.length;
  var isLE = false;
  var first = true;
  var c1, c2;

  while (i < len) {
    c1 = data[i++];
    c2 = data[i++];

    if (first && i === 2) {
      first = false;
      if (c1 === 0xFE && c2 === 0xFF) {
        isLE = false;
      } else if (c1 === 0xFF && c2 === 0xFE) {
        // Little-endian
        isLE = true;
      } else {
        isLE = isUTF16LE(data);
        i = 0;
      }
      continue;
    }

    if (isLE) {
      results[results.length] = c1;
      results[results.length] = c2;
    } else {
      results[results.length] = c2;
      results[results.length] = c1;
    }
  }

  return results;
}

/**
 * UTF-16LE to UTF-16
 *
 * @private
 * @ignore
 */
function UTF16LEToUTF16(data, options) {
  var isLE = false;
  var bom;

  if (options && options.bom) {
    var optBom = options.bom;
    if (!isString(optBom)) {
      optBom = 'BE';
    }

    if (optBom.charAt(0).toUpperCase() === 'B') {
      // Big-endian
      bom = [0xFE, 0xFF];
    } else {
      // Little-endian
      bom = [0xFF, 0xFE];
      isLE = true;
    }
  }

  var results = [];
  var len = data && data.length;
  var i = 0;

  if (len >= 2 &&
      ((data[0] === 0xFE && data[1] === 0xFF) ||
       (data[0] === 0xFF && data[1] === 0xFE))
  ) {
    i = 2;
  }

  if (bom) {
    results[0] = bom[0];
    results[1] = bom[1];
  }

  var c1, c2;
  while (i < len) {
    c1 = data[i++];
    c2 = data[i++];

    if (isLE) {
      results[results.length] = c1;
      results[results.length] = c2;
    } else {
      results[results.length] = c2;
      results[results.length] = c1;
    }
  }

  return results;
}

/**
 * UTF-16BE to UTF-16LE
 *
 * @private
 * @ignore
 */
function UTF16BEToUTF16LE(data) {
  var results = [];
  var i = 0;
  var len = data && data.length;
  var c1, c2;

  if (len >= 2 &&
      ((data[0] === 0xFE && data[1] === 0xFF) ||
       (data[0] === 0xFF && data[1] === 0xFE))
  ) {
    i = 2;
  }

  while (i < len) {
    c1 = data[i++];
    c2 = data[i++];
    results[results.length] = c2;
    results[results.length] = c1;
  }

  return results;
}

/**
 * UTF-16LE to UTF-16BE
 *
 * @private
 * @ignore
 */
function UTF16LEToUTF16BE(data) {
  return UTF16BEToUTF16LE(data);
}

/**
 * UTF-8 to UTF-16
 *
 * @private
 * @ignore
 */
function UTF8ToUTF16(data, options) {
  return UNICODEToUTF16(UTF8ToUNICODE(data), options);
}

/**
 * UTF-16 to UTF-8
 *
 * @private
 * @ignore
 */
function UTF16ToUTF8(data) {
  return UNICODEToUTF8(UTF16ToUNICODE(data));
}

/**
 * UTF-8 to UTF-16BE
 *
 * @private
 * @ignore
 */
function UTF8ToUTF16BE(data) {
  return UNICODEToUTF16BE(UTF8ToUNICODE(data));
}

/**
 * UTF-16BE to UTF-8
 *
 * @private
 * @ignore
 */
function UTF16BEToUTF8(data) {
  return UNICODEToUTF8(UTF16BEToUNICODE(data));
}

/**
 * UTF-8 to UTF-16LE
 *
 * @private
 * @ignore
 */
function UTF8ToUTF16LE(data) {
  return UNICODEToUTF16LE(UTF8ToUNICODE(data));
}

/**
 * UTF-16LE to UTF-8
 *
 * @private
 * @ignore
 */
function UTF16LEToUTF8(data) {
  return UNICODEToUTF8(UTF16LEToUNICODE(data));
}

/**
 * Assign the internal encoding name from the argument encoding name.
 *
 * @private
 * @ignore
 */
function assignEncodingName(target) {
  var name = '';
  var expect = ('' + target).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  var aliasNames = getKeys(EncodingAliases);
  var len = aliasNames.length;
  var hit = 0;
  var encoding, encodingLen, j;

  for (var i = 0; i < len; i++) {
    encoding = aliasNames[i];
    if (encoding === expect) {
      name = encoding;
      break;
    }

    encodingLen = encoding.length;
    for (j = hit; j < encodingLen; j++) {
      if (encoding.slice(0, j) === expect.slice(0, j) ||
          encoding.slice(-j) === expect.slice(-j)) {
        name = encoding;
        hit = j;
      }
    }
  }

  if (hasOwnProperty.call(EncodingAliases, name)) {
    return EncodingAliases[name];
  }

  return name;
}


// Helpers

function isObject(x) {
  var type = typeof x;
  return type === 'function' || type === 'object' && !!x;
}

function isArray(x) {
  return Array.isArray ? Array.isArray(x) :
    toString.call(x) === '[object Array]';
}

function isString(x) {
  return typeof x === 'string' || toString.call(x) === '[object String]';
}


function getKeys(object) {
  if (Object.keys) {
    return Object.keys(object);
  }

  var keys = [];
  for (var key in object) {
    if (hasOwnProperty.call(object, key)) {
      keys[keys.length] = key;
    }
  }

  return keys;
}


function createBuffer(bits, size) {
  if (!HAS_TYPED) {
    return new Array(size);
  }

  switch (bits) {
    case 8: return new Uint8Array(size);
    case 16: return new Uint16Array(size);
  }
}


function stringToBuffer(string) {
  var length = string.length;
  var buffer = createBuffer(16, length);

  for (var i = 0; i < length; i++) {
    buffer[i] = string.charCodeAt(i);
  }

  return buffer;
}


function codeToString_fast(code) {
  if (CAN_CHARCODE_APPLY && CAN_CHARCODE_APPLY_TYPED) {
    var len = code && code.length;
    if (len < APPLY_BUFFER_SIZE) {
      if (APPLY_BUFFER_SIZE_OK) {
        return fromCharCode.apply(null, code);
      }

      if (APPLY_BUFFER_SIZE_OK === null) {
        try {
          var s = fromCharCode.apply(null, code);
          if (len > APPLY_BUFFER_SIZE) {
            APPLY_BUFFER_SIZE_OK = true;
          }
          return s;
        } catch (e) {
          // Ignore RangeError: arguments too large
          APPLY_BUFFER_SIZE_OK = false;
        }
      }
    }
  }

  return codeToString_chunked(code);
}


function codeToString_chunked(code) {
  var string = '';
  var length = code && code.length;
  var i = 0;
  var sub;

  while (i < length) {
    if (code.subarray) {
      sub = code.subarray(i, i + APPLY_BUFFER_SIZE);
    } else {
      sub = code.slice(i, i + APPLY_BUFFER_SIZE);
    }
    i += APPLY_BUFFER_SIZE;

    if (APPLY_BUFFER_SIZE_OK) {
      string += fromCharCode.apply(null, sub);
      continue;
    }

    if (APPLY_BUFFER_SIZE_OK === null) {
      try {
        string += fromCharCode.apply(null, sub);
        if (sub.length > APPLY_BUFFER_SIZE) {
          APPLY_BUFFER_SIZE_OK = true;
        }
        continue;
      } catch (e) {
        APPLY_BUFFER_SIZE_OK = false;
      }
    }

    return codeToString_slow(code);
  }

  return string;
}


function codeToString_slow(code) {
  var string = '';
  var length = code && code.length;

  for (var i = 0; i < length; i++) {
    string += fromCharCode(code[i]);
  }

  return string;
}


function stringToCode(string) {
  var code = [];
  var len = string && string.length;

  for (var i = 0; i < len; i++) {
    code[i] = string.charCodeAt(i);
  }

  return code;
}


function codeToBuffer(code) {
  if (HAS_TYPED) {
    // Use Uint16Array for Unicode codepoint.
    return new Uint16Array(code);
  } else {
    if (isArray(code)) {
      return code;
    }
  }

  var length = code && code.length;
  var buffer = [];

  for (var i = 0; i < length; i++) {
    buffer[i] = code[i];
  }

  return buffer;
}


function bufferToCode(buffer) {
  if (isArray(buffer)) {
    return buffer;
  }

  return slice.call(buffer);
}

// Base64
/* Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
 * Version: 1.0
 * LastModified: Dec 25 1999
 * This library is free.  You can redistribute it and/or modify it.
 */
// -- Masanao Izumo Copyright 1999 "free"
// Modified to add support for Binary Array for Encoding.js

var base64EncodeChars = [
  65,  66,  67,  68,  69,  70,  71,  72,  73,  74,  75,  76,  77,
  78,  79,  80,  81,  82,  83,  84,  85,  86,  87,  88,  89,  90,
  97,  98,  99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122,
  48,  49,  50,  51,  52,  53,  54,  55,  56,  57,  43,  47
];

var base64DecodeChars = [
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 62, -1, -1, -1, 63,
  52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1,
  -1,  0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14,
  15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, -1, -1, -1, -1, -1,
  -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, -1, -1, -1, -1, -1
];

var base64EncodePadding = '='.charCodeAt(0);


function base64encode(data) {
  var out, i, len;
  var c1, c2, c3;

  len = data && data.length;
  i = 0;
  out = [];

  while (i < len) {
    c1 = data[i++];
    if (i == len) {
      out[out.length] = base64EncodeChars[c1 >> 2];
      out[out.length] = base64EncodeChars[(c1 & 0x3) << 4];
      out[out.length] = base64EncodePadding;
      out[out.length] = base64EncodePadding;
      break;
    }

    c2 = data[i++];
    if (i == len) {
      out[out.length] = base64EncodeChars[c1 >> 2];
      out[out.length] = base64EncodeChars[((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4)];
      out[out.length] = base64EncodeChars[(c2 & 0xF) << 2];
      out[out.length] = base64EncodePadding;
      break;
    }

    c3 = data[i++];
    out[out.length] = base64EncodeChars[c1 >> 2];
    out[out.length] = base64EncodeChars[((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4)];
    out[out.length] = base64EncodeChars[((c2 & 0xF) << 2) | ((c3 & 0xC0) >> 6)];
    out[out.length] = base64EncodeChars[c3 & 0x3F];
  }

  return codeToString_fast(out);
}


function base64decode(str) {
  var c1, c2, c3, c4;
  var i, len, out;

  len = str && str.length;
  i = 0;
  out = [];

  while (i < len) {
    /* c1 */
    do {
      c1 = base64DecodeChars[str.charCodeAt(i++) & 0xFF];
    } while (i < len && c1 == -1);

    if (c1 == -1) {
      break;
    }

    /* c2 */
    do {
      c2 = base64DecodeChars[str.charCodeAt(i++) & 0xFF];
    } while (i < len && c2 == -1);

    if (c2 == -1) {
      break;
    }

    out[out.length] = (c1 << 2) | ((c2 & 0x30) >> 4);

    /* c3 */
    do {
      c3 = str.charCodeAt(i++) & 0xFF;
      if (c3 == 61) {
        return out;
      }
      c3 = base64DecodeChars[c3];
    } while (i < len && c3 == -1);

    if (c3 == -1) {
      break;
    }

    out[out.length] = ((c2 & 0xF) << 4) | ((c3 & 0x3C) >> 2);

    /* c4 */
    do {
      c4 = str.charCodeAt(i++) & 0xFF;
      if (c4 == 61) {
        return out;
      }
      c4 = base64DecodeChars[c4];
    } while (i < len && c4 == -1);

    if (c4 == -1) {
      break;
    }

    out[out.length] = ((c3 & 0x03) << 6) | c4;
  }

  return out;
}

return Encoding;
});
