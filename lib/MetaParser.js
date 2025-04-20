const fs = require('fs');
const { Transform } = require('stream');

class MetaParser extends Transform {
  constructor() {
    super({ decodeStrings: false });
    this.cacheControl = null;
    this.buffer = '';
  }

  _transform(chunk, encoding, callback) {
    this.buffer += chunk;
    // 简单查找 meta 标签
    const metaMatch = this.buffer.match(/<meta\s[^>]*http-equiv=['"]?Cache-Control['"]?[^>]*>/i);
    if (metaMatch) {
      const contentMatch = metaMatch[0].match(/content=['"]([^'"]+)/i);
      if (contentMatch) {
        this.cacheControl = contentMatch[1];
        this.emit('cacheControl', this.cacheControl); // 触发自定义事件
      }
    }
    
    this.push(chunk);
    callback();
  }
}

module.exports = MetaParser;
