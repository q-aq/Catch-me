// 获取DOM元素
const resourceList = document.getElementById('resource-list');
const searchInput = document.getElementById('search-input');
const sizeFilter = document.getElementById('size-filter');
const refreshBtn = document.getElementById('refresh-btn');
const toast = document.getElementById('toast');
const resourcesCount = document.getElementById('resources-count');
const totalSize = document.getElementById('total-size');

// 获取所有类型筛选器
const typeFilters = {
    'all': document.getElementById('type-all'),
    'image': document.getElementById('type-image'),
    'script': document.getElementById('type-script'),
    'stylesheet': document.getElementById('type-stylesheet'),
    'font': document.getElementById('type-font'),
    'media': document.getElementById('type-media'),
    'xhr': document.getElementById('type-xhr'),
    'document': document.getElementById('type-document')
};

// 获取所有排序选项
const sortOptions = {
    'default': document.getElementById('sort-default'),
    'size': document.getElementById('sort-size'),
    'time': document.getElementById('sort-time'),
    'name': document.getElementById('sort-name')
};

// 获取排序方向
const sortMethodOptions = {
    'asc': document.getElementById('sort-asc'),
    'desc': document.getElementById('sort-desc')
}

// 当前筛选状态
let currentFilters = {
    search: '',
    size: 'all',
    types: ['all', 'image', 'script', 'stylesheet', 'font', 'media', 'xhr', 'document'],
    sort: 'default',
    sortMethod: 'asc'
};

// 存储资源数据
let resources = [];

// 初始化
document.addEventListener('DOMContentLoaded', function () {
    // renderResources(resources); // 初始化渲染所有资源
    loadResources();            // 从插件获取资源
    setupEventListeners();      // 设置事件监听器
});

// 检查插件API是否可用
function isExtensionContext() {
    // 支持Chrome、Edge、Firefox
    return typeof chrome !== 'undefined' || typeof browser !== 'undefined';
}

// 标准化资源类型
function normalizeResourceType(type) {
    const typeMap = {
        'stylesheet': 'stylesheet',
        'script': 'script',
        'image': 'image',
        'font': 'font',
        'media': 'media',
        'xmlhttprequest': 'xhr',     // Firefox中XHR的类型名称
        'xhr': 'xhr',                // Chrome/Edge中XHR的类型名称
        'document': 'document',
        'other': 'document'
    };
    return typeMap[type] || 'document';
}

// 从URL中提取文件名的辅助函数
function getFileNameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        return pathname.substring(pathname.lastIndexOf('/') + 1) || urlObj.hostname;
    } catch (e) {
        return 'unknown';
    }
}

// 从后台加载资源并追加到现有资源中
function loadResources() {
    // 只在插件环境中尝试加载资源
    if (!isExtensionContext()) {
        console.log('不在插件环境中，使用静态数据');
        return;
    }
    
    try {
        // 向后台发送消息请求
        chrome.runtime.sendMessage({action: "getResources"}, function(response) {
            if (chrome.runtime.lastError) {
                console.log('插件API错误:', chrome.runtime.lastError);
                return;
            }
            
            if (response && response.resources) {
                // 标准化后台资源数据并过滤掉扩展自身文件
                const normalizedResources = response.resources
                    .map(resource => ({
                        ...resource,
                        type: normalizeResourceType(resource.type),
                        name: resource.name || getFileNameFromUrl(resource.url)
                    }))
                    .filter(resource => {
                        // 过滤掉扩展自身文件
                        return !(resource.url.includes('chrome-extension://') || 
                                resource.url.includes('moz-extension://') ||
                                resource.name === 'main.html' ||
                                resource.name === 'function.js' ||
                                resource.name === 'background.js' ||
                                resource.name === 'style.css');
                    });
                
                // 替换现有资源
                resources = normalizedResources;
                // 渲染资源
                renderResources(resources);
            }
        });
    } catch (e) {
        console.log('无法加载插件资源:', e);
    }
}

// 清空列表资源
function clearResources() {
    if (isExtensionContext()) {
        try {
            chrome.runtime.sendMessage({action: "clearResources"}, function(response) {
                if (response && response.status === "cleared") {
                    resources = [];
                    renderResources(resources);
                    showToast('资源列表已清空');
                }
            });
        } catch (e) {
            console.log('清空资源失败:', e);
        }
    } else {
        resources = [];
        renderResources(resources);
        showToast('资源列表已清空');
    }
}

// 为所有交互元素设置事件监听器
function setupEventListeners() {
    // 搜索框输入事件
    searchInput.addEventListener('input', (e) => {
        currentFilters.search = e.target.value.toLowerCase();
        applyFilters();
    });

    // 大小筛选事件
    sizeFilter.addEventListener('change', (e) => {
        currentFilters.size = e.target.value;
        applyFilters();
    });

    // 清空按钮事件
    refreshBtn.addEventListener('click', () => {
        clearResources();
    });

    // 单个类型筛选事件
    for (const [type, checkbox] of Object.entries(typeFilters)) {
        if (type !== 'all') {
            checkbox.addEventListener('change', () => {
                updateTypeFilters();
            });
        }
    }

    // 全选/取消全选逻辑
    typeFilters.all.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        for (const [type, checkbox] of Object.entries(typeFilters)) {
            if (type !== 'all') {
                checkbox.checked = isChecked;
            }
        }
        updateTypeFilters();
    });

    // 排序选项事件
    for (const [sort, radio] of Object.entries(sortOptions)) {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                currentFilters.sort = sort;
                applyFilters();
            }
        });
    }

    // 排序方向事件
    for (const [method, radio] of Object.entries(sortMethodOptions)) {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                currentFilters.sortMethod = method;
                applyFilters();
            }
        });
    }
}

// 更新类型筛选器
function updateTypeFilters() {
    //收集所有选中的类型
    const selectedTypes = [];
    for (const [type, checkbox] of Object.entries(typeFilters)) {
        if (checkbox.checked && type !== 'all') {
            selectedTypes.push(type);
        }
    }
    
    // 更新状态
    const totalTypeCount = Object.keys(typeFilters).length - 1; // 除"all"外的选项数
    typeFilters.all.checked = selectedTypes.length === totalTypeCount;
    
    currentFilters.types = selectedTypes;
    // 应用当前筛选
    applyFilters();
}

// 筛选与排序
function applyFilters() {
    let filteredResources = [...resources];
    
    // 应用搜索筛选
    if (currentFilters.search) {
        filteredResources = filteredResources.filter(resource => 
            (resource.name && resource.name.toLowerCase().includes(currentFilters.search)) || 
            (resource.url && resource.url.toLowerCase().includes(currentFilters.search))
        );
    }
    
    // 应用类型筛选
    if (currentFilters.types.length > 0) {
        filteredResources = filteredResources.filter(resource => 
            currentFilters.types.includes(resource.type)
        );
    } else {
        // 如果没有选择任何类型，显示空列表
        filteredResources = [];
    }
    
    // 应用大小筛选
    switch(currentFilters.size) {
        case 'tiny':
            filteredResources = filteredResources.filter(resource => resource.size < 10000);
            break;
        case 'small':
            filteredResources = filteredResources.filter(resource => resource.size >= 10000 && resource.size < 100000);
            break;
        case 'medium':
            filteredResources = filteredResources.filter(resource => resource.size >= 100000 && resource.size < 1000000);
            break;
        case 'large':
            filteredResources = filteredResources.filter(resource => resource.size >= 1000000);
            break;
    }
    
    // 应用排序
    switch(currentFilters.sort) {
        case 'size':
            filteredResources.sort((a, b) => {
                const result = b.size - a.size;
                return currentFilters.sortMethod === 'asc' ? -result : result;
             });
            break;
        case 'time':
            filteredResources.sort((a, b) => {
                const result = b.time - a.time;
                return currentFilters.sortMethod === 'asc' ? -result : result;
            });
            break;
        case 'name':
            filteredResources.sort((a, b) => {
                const result = a.name.localeCompare(b.name);
                return currentFilters.sortMethod === 'asc' ? result : -result;
             });
            break;
        default:
            break;
    }
    
    renderResources(filteredResources);
}

// 渲染资源列表
function renderResources(resourcesToRender) {
    resourceList.innerHTML = '';
    
    if (resourcesToRender.length === 0) {
        resourceList.innerHTML = `
            <div class="empty-state">
                <i>🔍</i>
                <p>没有找到匹配的资源</p>
                <p>尝试调整筛选条件</p>
            </div>
        `;
        
        resourcesCount.textContent = '0';
        totalSize.textContent = '0 KB';
        return;
    }
    
    // 计算总大小
    const totalSizeBytes = resourcesToRender.reduce((sum, resource) => sum + (resource.size || 0), 0);
    totalSize.textContent = formatFileSize(totalSizeBytes);
    resourcesCount.textContent = resourcesToRender.length;
    
    resourcesToRender.forEach(resource => {
        const item = document.createElement('div');
        item.className = 'resource-item';
        
        // 根据资源类型设置不同的边框颜色
        const borderColor = getTypeColor(resource.type);
        item.style.borderLeftColor = borderColor;
        
        item.innerHTML = `
            <div class="resource-header">
                <div class="resource-name">${resource.name || 'unknown'}</div>
                <div class="resource-size">${formatFileSize(resource.size || 0)}</div>
            </div>
            <div class="resource-url">${resource.url || ''}</div>
            <div class="resource-meta">
                <span class="resource-type-badge">${getTypeName(resource.type)}</span>
                <span>加载时间: ${resource.time || 0}ms</span>
            </div>
        `;
        
        // 添加点击复制功能
        const urlElement = item.querySelector('.resource-url');
        urlElement.addEventListener('click', () => {
            copyToClipboard(resource.url);
            showToast('URL已复制到剪贴板');
        });
        
        resourceList.appendChild(item);
    });
}

// 获取资源类型名称
function getTypeName(type) {
    const typeMap = {
        'image': 'Image',
        'script': 'JS',
        'stylesheet': 'CSS',
        'font': 'Font',
        'media': 'Media',
        'xhr': 'XHR',
        'document': 'Document'
    };
    return typeMap[type] || type;
}

// 获取资源类型颜色
function getTypeColor(type) {
    const colorMap = {
        'image': '#f72585',
        'script': '#fca311',
        'stylesheet': '#2a9d8f',
        'font': '#9b5de5',
        'media': '#00bbf9',
        'xhr': '#ffaa00',
        'document': '#f15bb5'
    };
    return colorMap[type] || '#4cc9f0';
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// 复制到剪贴板
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('无法复制文本: ', err);
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    });
}

// 显示提示信息
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}