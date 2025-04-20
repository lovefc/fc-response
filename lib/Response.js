/*
 * @Author       : lovefc
 * @Blog         : http://lovefc.cn
 * @Email        : fcphp@qq.com
 * @Date         : 2025-04-16 11:13:56
 * @LastEditTime : 2025-04-20 22:56:12
 */

const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');
const mime = require('mime-types');
const MetaParser = require('./MetaParser.js');
const cacheMap = new Map();

class Response {

  constructor(options) {
    let that = this;
    this.defaultFiles = 'index.html,index.htm'; // 默认文档
    this.maxage = 0; // 文件缓存时间
    this.encoding = 'utf8'; // 打开文件编码
    this.proxy_model = false; // 代理模式，缓存和gzip由nginx处理
    for (let key in options) {
      if (key in that) {
        that[key] = options[key];
      }
    }
    let default_files = this.parseFilenames(this.defaultFiles);
    this.defaultFiles = default_files;
  }

  // 判断数字
  isNumber(value) {
    const num = Number(value);
    return !Number.isNaN(num) && num !== 0 && typeof value !== 'boolean';
  }

  // 绑定
  use(req, res) {
    this.req = req;
    this.res = res;

    return this;
  }

  // 分割文本为数组
  parseFilenames(str) {
    if (typeof str !== 'string') {
      return str;
    }
    return str.split(',').map(item => item.trim()).filter(item => item);
  }

  // 链式调用支持
  setStatus(statusCode) {
    this.res.statusCode = statusCode;
    return this;
  }

  // 设置文件头
  setHeader(key, value) {
    this.res.setHeader(key, value);
    return this;
  }

  // 发送内容
  send(body = null, options = {}) {
    const {
      status = 200,
      type = 'text/html',
      headers = {}
    } = options;

    this.res.writeHead(status, {
      "Content-Type": type
    });
    // 设置其他 Header
    if (headers && typeof headers === 'object') {
      Object.entries(headers).forEach(([key, value]) => {
        this.setHeader(key, value);
      });
    }
    if (body) {
      this.res.end(body);
    }
  }

  // 发送 JSON 数据
  json(data, statusCode = 200) {
    try {
      let res = JSON.stringify(data);
      this.send(res, { status: statusCode, type: 'application/json;charset=UTF8' });
    } catch (e) {
      this.error(500, 'json error');
    }
    return this;
  }

  // 重定向
  redirect(url, statusCode = 302) {
    this.res.writeHead(statusCode, { 'Location': url });
    this.res.end();
    return this;
  }

  // 发送错误响应
  error(statusCode = 500, message = 'Internal Server Error') {
    this.send(message, { status: statusCode, type: 'text/plain;charset=UTF8' });
    return this;
  }

  // 强制下载文件
  download(filePath, filename = 'file') {
    this.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    this.sendFile(filePath);
    return this;
  }

  // 判断是否经过代理
  isProxyModel() {
    let req = this.req;
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    let proxy_sever = req.headers['x-proxy-server'];
    if (forwardedFor || realIp || (proxy_sever === 'nginx')) {
      return true;
    } else {
      return false;
    }
  }

  // 检测非空
  isEmpty(str) {
    return typeof str !== 'undefined' &&
      str !== null &&
      str !== '';
  }

  // 解析 Cache-Control 头的函数
  parseCacheControl(cacheControl) {
    const result = { 'max-age': 0 };
    if (this.isEmpty(cacheControl) === false) {
      return result;
    }
    const directives = cacheControl.split(/,\s*/);
    for (const directive of directives) {
      const [key, value] = directive.split("=");
      result[key.toLowerCase()] = value ? value.replace(/"/g, "") : true;
    }
    return result;
  }

  // http 缓存
  httpCache(cache_time = 0) {
    let req = this.req;
    if (req.headers['if-modified-since']) {
      let oDate = new Date(req.headers['if-modified-since']);
      let time_client = Math.floor(oDate.getTime() / 1000) + cache_time;
      let time_server = Math.floor(new Date().getTime() / 1000);
      if (time_server > time_client) {
        return false;
      } else {
        return true;
      }
    }
  }

  // http缓存消息
  httpCacheMsg() {
    let res = this.req;
    this.res.writeHeader(304);
    this.res.write('Not Modified');
    this.res.end();
  }

  // 缓存处理
  cache() {
    // 获取缓存时间
    let cacheControl = this.req.headers["cache-control"];
    let parsedCacheControl = this.parseCacheControl(cacheControl);
    let maxAge = parsedCacheControl["max-age"] ? parseInt(parsedCacheControl["max-age"], 10) : 0;
    if (maxAge != 0) {
      this.maxage = maxAge;
    }
    // 缓存处理
    if (this.httpCache(this.maxage)) {
      this.httpCacheMsg();
      return true;
    }
    return false;
  }


  // 跨域设置
  allowOrigin(domain = '*') {
    this.res.setHeader("Access-Control-Allow-Origin", domain);
    this.res.setHeader("Access-Control-Allow-Headers", "Content-type,Content-Length,Authorization,Accept,X-Requested-Width");
    this.res.setHeader("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
    return this;
  }

  // 读取目录文件并且显示
  async server(dir, filename = '') {
    this.rootDir = path.resolve(dir);
    try {
      fs.promises.access(this.rootDir).catch(() => {
        let body = '<html><head><title>404 Not Found</title></head><body style="width:100%;height:100%;top:45%;position:relative;overflow:hidden;"><center><h1>Directory not found</h1></center></body></html>';
        this.send(body, { status: 404, type: 'text/html;charset=UTF8' });
        return;
      });
      const filePath = path.join(this.rootDir, filename);
      const stats = await fs.promises.stat(filePath).catch(() => null);

      if (!stats) {
        // 文件不存在
        let body = '<html><head><title>404 Not Found</title></head><body style="width:100%;height:100%;top:45%;position:relative;overflow:hidden;"><center><h1>404 Not Found</h1></center></body></html>';
        this.send(body, { status: 404, type: 'text/html;charset=UTF8' });
        return;
      }
      if (stats.isDirectory()) {
        const files = await fs.promises.readdir(filePath);
        for (const defaultFile of this.defaultFiles) {
          const defaultFilePath = path.join(filePath, defaultFile);
          try {
            const defaultFileStats = await fs.promises.stat(defaultFilePath);
            if (defaultFileStats.isFile()) {
              return this.sendFile(defaultFilePath);
            }
          } catch (error) {
            console.error(error);
          }
        }
        const directoryList = this.generateDirectoryList(filename, files);
        this.send(directoryList, { status: 200, type: 'text/html;charset=UTF8' });
        return;
      }
      this.sendFile(filePath);
    } catch (error) {
      console.log(error);
      let body = '<html><head><title>404 Not Found</title></head><body style="width:100%;height:100%;top:45%;position:relative;overflow:hidden;"><center><h1>Internal server error</h1></center></body></html>';
      this.send(body, { status: 505, type: 'text/html;charset=UTF8' });
    }
  }

  // 获取文件信息
  async getFileInfo(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats;
    } catch (err) {
      console.error(err);
      return 0;
    }
  }

  // 读取文件
  async sendFile(filePath) {

    if (this.cache()) {
      return;
    }

    const ext = path.extname(filePath);

    const contentType = mime.contentType(ext) || 'application/octet-stream';

    let that = this;

    const fileStream = fs.createReadStream(filePath);

    if (contentType === 'text/html') {
      const parser = new MetaParser();
      parser.on('cacheControl', (value) => {
        if (!cacheMap.has(filePath)) {
          let _maxAge = this.parseCacheControl(value);
          let maxAge = _maxAge['max-age'] || 0;
          cacheMap.set(filePath, maxAge);
        }
      });
      fileStream.pipe(parser);
    } else {
      this.isNumber(this.maxage) && cacheMap.set(filePath, this.maxage);
    }

    let maxAge2 = cacheMap.get(filePath);

    if ((this.isNumber(this.maxage) === false) && this.isNumber(maxAge2)) {
      this.maxage = maxAge2;
    }
    fileStream.on('open', () => {
      // 声明类型
      that.setHeader('Content-Type', contentType);
      // 缓存处理
      if (this.maxage != 0) {
        that.setHeader('Cache-Control', 'max-age=' + this.maxage);
        let lastModified = new Date().toUTCString();
        that.setHeader('Last-Modified', lastModified);
      }
      fileStream.pipe(that.res);
    });
    fileStream.on('error', (err) => {
      console.log(err);
      if (err.code === 'ENOENT') {
        let body = '<html><head><title>404 Not Found</title></head><body style="width:100%;height:100%;top:45%;position:relative;overflow:hidden;"><center><h1>File not found</h1></center></body></html>';
        that.send(body, { status: 404, type: 'text/html;charset=UTF8' });
      } else {
        let body = '<html><head><title>404 Not Found</title></head><body style="width:100%;height:100%;top:45%;position:relative;overflow:hidden;"><center><h1>Server error</h1></center></body></html>';
        that.send(body, { status: 500, type: 'text/html;charset=UTF8' });
      }
    });
  }

  // 目录遍历
  generateDirectoryList(currentPath, files) {
    const title = `Index of ${currentPath}`;
    const listItems = files.map(file => {
      const isDir = fs.statSync(path.join(this.rootDir, currentPath, file)).isDirectory();
      const suffix = isDir ? '/' : '';
      return `<li><a href="${path.join(currentPath, file)}">${file}${suffix}</a></li>`;
    }).join('\n');

    return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: sans-serif; margin: 2rem; }
          h1 { margin-bottom: 1rem; }
          ul { list-style: none; padding: 0; }
          li { margin: 0.5rem 0; }
          a { text-decoration: none; color: #0366d6; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <ul>${listItems}</ul>
      </body>
    </html>
  `;
  }

}

module.exports = Response;