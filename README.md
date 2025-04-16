**Http工具库--fc-response** 

- Http工具库,封装了一些快捷操作,建议搭配fc-route使用。

**如何安装：** 

````
npm install fc-response

````

**如何使用：** 
```
const http = require('http');

const fs = require('fs');

const path = require('path');

let server = http.createServer();

// 引入路由类
const _router = require('fc-route');

// 引入工具类
const fc_response = require("fc-response");

// 实例化工具类，并且设置静态目录中，默认的索引文件名称
let _res = new fc_response({'defaultFiles':'index.html,index.htm'});

let router = new _router();

router.get(function (req, res) {
	// 绑定res参数，以便接下来使用
	_res.use(res);
});

//默认页面
router.get('/index',async function (req, res) {
    _res.send('hello world');
});

// 输出json
router.get('/json',async function (req, res) {
	_res.json({ message: 'Hello World', timestamp: Date.now() });
});

// 重定向
router.get('/redirect',,async function (req, res) {
	_res.redirect('https://blog.lovefc.cn');
});

// 下载文件
router.get('/down',async function (req, res) {
	let path = './demo/1.jpg';
	_res.download(path,'1.html');
});

// 绑定目录，并且输出静态文件，这里还可以单独指定一个文件进行输出
router.get('/demo/~d',async function (req, res) {
	let { d } = req.params;
	_res.server('./demo',d);
});

// 输出一个图片
router.get('/image',async function (req, res) {
	let { d } = req.params;
	// 在demo下的一个图片文件
	_res.server('./demo','1.jpg');
});

router.http(server);

server.listen(3000, function () {
	console.log('服务器3000启动成功，可以访问了。。。')
})
```

**使用参考**

>demo案例请看这里 >>> [戳这里](https://github.com/lovefc/fc-response-demo)

## License

[MIT](https://opensource.org/licenses/MIT)

Copyright (c) 2022-[lovefc](http://lovefc.cn)