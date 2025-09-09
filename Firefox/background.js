// 监听网络请求并收集资源
let resources = [];
let requestStartTimes = new Map();

// 获取扩展URL前缀（在事件监听器外部定义）
let extensionUrl = '';
try {
    if (chrome.runtime && chrome.runtime.getURL) {
        extensionUrl = chrome.runtime.getURL('');
    }
} catch (e) {
    console.log('无法获取扩展URL:', e);
}

chrome.webRequest.onBeforeRequest.addListener(
    function(details) {
        // 记录请求开始时间
        requestStartTimes.set(details.requestId, Date.now());
    },
    {urls: ["<all_urls>"]}
);

chrome.webRequest.onErrorOccurred.addListener(
    function(details) {
        requestStartTimes.delete(details.requestId);
    },
    {urls: ["<all_urls>"]}
);

// 定期清理过期记录
setInterval(() => {
    const now = Date.now();
    for (const [requestId, startTime] of requestStartTimes.entries()) {
        if (now - startTime > 300000) { // 5分钟超时
            requestStartTimes.delete(requestId);
        }
    }
}, 60000); // 每分钟检查一次

chrome.webRequest.onCompleted.addListener(
    function(details) {
        // 多重过滤条件，防止捕获扩展自身文件
        try {
            // 过滤扩展协议的请求
            if (details.url.startsWith('chrome-extension://') || 
                details.url.startsWith('moz-extension://')) {
                return;
            }
            
            // 如果能获取到扩展URL，过滤扩展自身的文件
            if (extensionUrl && details.url.startsWith(extensionUrl)) {
                return;
            }
            
            // 从URL中提取文件名
            const url = new URL(details.url);
            const pathname = url.pathname;
            const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
            
            // 黑名单过滤特定文件名
            const excludedFiles = ['main.html', 'function.js', 'background.js', 'style.css'];
            if (excludedFiles.includes(filename)) {
                return;
            }
            
            const name = filename || url.hostname;
            
            // 计算加载时间
            let loadTime = 0;
            const startTime = requestStartTimes.get(details.requestId);
            if (startTime) {
                loadTime = Date.now() - startTime;
                requestStartTimes.delete(details.requestId); // 清理
            }

            const resource = {
                id: details.requestId,
                name: name,
                url: details.url,
                type: details.type,
                size: details.responseHeaders ? getHeaderSize(details.responseHeaders) : 0,
                time: loadTime
            };
            
            resources.push(resource);
            
            // 限制资源列表大小
            if (resources.length > 1000) {
                resources.shift();
            }
        } catch (e) {
            console.log('处理请求时出错:', e);
        }
    },
    {urls: ["<all_urls>"]},
    ["responseHeaders"]
);

// 获取响应头大小
function getHeaderSize(headers) {
    let size = 0;
    headers.forEach(header => {
        size += header.name.length + header.value.length;
    });
    return size;
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getResources") {
        sendResponse({resources: resources});
    } else if (request.action === "clearResources") {
        resources = [];
        sendResponse({status: "cleared"});
    }
    return true; // 保持消息通道开放以支持异步响应
});