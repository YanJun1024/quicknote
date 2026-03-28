﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// Flomo Lite - 网页版应用逻辑 (离线优先架构)
class FlomoWebApp {
    constructor() {
        this.notes = [];
        this.tags = new Set();
        this.currentSearch = '';
        this.isSearchMode = false;
        this.editingNoteId = null;
        this.currentTagPreview = '';
        this.theme = localStorage.getItem('flomo-theme') || 'light';
        this.debounceTimer = null;
        this.toolbarUpdateTimer = null;
        this.lastProcessedContent = '';
        this.resizeTimer = null;
        this.avatarData = localStorage.getItem('user-avatar') || '';
        this.apiBaseUrl = 'http://localhost:8080/api';
        
        this.domCache = {};
        
        // 绑定方法到this
        this.insertLink = this.insertLink.bind(this);
        
        this.init();
    }
    
    getDomElement(id) {
        if (!this.domCache[id]) {
            this.domCache[id] = document.getElementById(id);
        }
        return this.domCache[id];
    }

    async init() {
        await this.loadData();
        this.bindEvents();
        this.applyTheme();
        this.toggleMode(false);
        this.render();
        this.initResizeObserver();
        this.loadAvatar();
        this.setupOfflineDetection();
        this.initEditorScrollProtection(); // 新增：初始化光标保护
    }

    // 新增：编辑器滚动保护初始化
    initEditorScrollProtection() {
        const editor = document.getElementById('noteInput');
        if (!editor) return;
        
        // 监听滚动事件，检测是否滚动到底部
        editor.addEventListener('scroll', () => {
            const isScrolledToBottom = 
                editor.scrollHeight - editor.scrollTop <= editor.clientHeight + 20;
            
            if (isScrolledToBottom) {
                editor.classList.add('scrolled-bottom');
            } else {
                editor.classList.remove('scrolled-bottom');
            }
        });
        
        // 监听光标位置变化
        editor.addEventListener('keyup', () => {
            this.ensureCursorVisible();
        });
        
        editor.addEventListener('click', () => {
            this.ensureCursorVisible();
        });
        
        editor.addEventListener('selectionchange', () => {
            this.ensureCursorVisible();
        });
        
        // 监听输入事件
        editor.addEventListener('input', () => {
            setTimeout(() => this.ensureCursorVisible(), 10);
        });
    }

    // 新增：确保光标可见
    ensureCursorVisible() {
        const editor = document.getElementById('noteInput');
        if (!editor) return;
        
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const rangeRect = range.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        const toolbar = document.querySelector('.editor-toolbar');
        
        if (!toolbar) return;
        
        const toolbarRect = toolbar.getBoundingClientRect();
        
        // 如果光标位置接近工具栏（距离小于40px）
        if (rangeRect.bottom > toolbarRect.top - 40) {
            // 计算需要滚动的距离，使光标在工具栏上方40px处
            const scrollNeeded = rangeRect.bottom - toolbarRect.top + 50;
            
            editor.scrollBy({
                top: scrollNeeded,
                behavior: 'smooth'
            });
        }
    }

    setupOfflineDetection() {
        window.addEventListener('online', () => {
            this.showToast('网络已连接', 'success');
        });
        
        window.addEventListener('offline', () => {
            this.showToast('网络已断开，应用将在联网后恢复正常', 'warning');
        });
    }

    loadAvatar() {
        const avatarImage = this.getDomElement('avatarImage');
        const avatarPlaceholder = this.getDomElement('avatarPlaceholder');
        const avatarNotesBadge = this.getDomElement('avatarNotesBadge');
        
        if (avatarNotesBadge) {
            avatarNotesBadge.textContent = this.notes.length;
        }
        
        if (this.avatarData) {
            avatarImage.src = this.avatarData;
            avatarImage.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
        } else {
            avatarImage.style.display = 'none';
            avatarPlaceholder.style.display = 'flex';
        }
    }

    handleAvatarUpload(file) {
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            this.showToast('请选择图片文件', 'error');
            return;
        }
        
        if (file.size > 2 * 1024 * 1024) {
            this.showToast('图片大小不能超过2MB', 'error');
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            this.avatarData = e.target.result;
            localStorage.setItem('user-avatar', this.avatarData);
            this.loadAvatar();
            this.showToast('头像已更新', 'success');
        };
        
        reader.onerror = () => {
            this.showToast('头像上传失败', 'error');
        };
        
        reader.readAsDataURL(file);
    }
    
    handleAttachmentUpload(files) {
        // 确保 files 是一个数组
        let fileList = [];
        if (Array.isArray(files)) {
            fileList = files;
        } else if (files.target && files.target.files) {
            // 将 FileList 转换为数组
            fileList = Array.from(files.target.files);
        } else {
            fileList = [files];
        }
        
        if (!fileList || fileList.length === 0) return;
        
        let successCount = 0;
        let errorCount = 0;
        
        fileList.forEach(file => {
            // 检查文件大小，限制为80MB
            if (file.size > 80 * 1024 * 1024) {
                this.showToast(`文件 ${file.name} 大小不能超过80MB`, 'error');
                errorCount++;
                return;
            }
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const base64Data = e.target.result;
                const fileName = file.name;
                
                // 在编辑区插入附件链接
                const input = document.getElementById('noteInput');
                if (input) {
                    // 创建附件链接元素
                    const attachmentLink = document.createElement('a');
                    attachmentLink.href = base64Data;
                    attachmentLink.download = fileName;
                    attachmentLink.className = 'attachment-link';
                    attachmentLink.innerHTML = `<i class="material-icons">attach_file</i> ${fileName}`;
                    
                    // 插入到编辑区
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        range.deleteContents();
                        range.insertNode(attachmentLink);
                        // 在链接后插入一个空格
                        const space = document.createTextNode(' ');
                        range.insertNode(space);
                        range.setStartAfter(space);
                        range.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    } else {
                        input.appendChild(attachmentLink);
                        input.appendChild(document.createTextNode(' '));
                    }
                    
                    successCount++;
                    
                    // 确保光标可见
                    setTimeout(() => this.ensureCursorVisible(), 50);
                }
            };
            
            reader.onerror = () => {
                this.showToast(`文件 ${file.name} 上传失败`, 'error');
                errorCount++;
            };
            
            reader.readAsDataURL(file);
        });
        
        // 显示总体上传结果
        setTimeout(() => {
            if (successCount > 0) {
                this.showToast(`成功添加 ${successCount} 个附件`, 'success');
            }
            if (errorCount > 0) {
                this.showToast(`有 ${errorCount} 个附件上传失败`, 'error');
            }
        }, 100);
    }
    
    insertHashtag() {
        // 获取当前活动的编辑区域
        let input = document.querySelector('.edit-textarea');
        if (!input) {
            input = document.getElementById('noteInput');
        }
        if (input) {
            // 插入#号
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const hashtag = document.createTextNode('#');
                range.deleteContents();
                range.insertNode(hashtag);
                range.setStartAfter(hashtag);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                input.appendChild(document.createTextNode('#'));
                // 将光标移到#号后面
                const range = document.createRange();
                const textNode = input.lastChild;
                if (textNode) {
                    range.setStart(textNode, textNode.length);
                    range.collapse(true);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
            input.focus();
            // 显示标签建议
            this.showTagSuggestions(input);
            // 确保光标可见
            setTimeout(() => this.ensureCursorVisible(), 50);
        }
    }
    
    showTagSuggestions(input) {
        // 移除旧的标签建议
        this.hideTagSuggestions();
        
        // 获取当前光标位置
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        
        // 获取光标前的文本，处理不同类型的startContainer
        let textBeforeCursor = '';
        if (range.startContainer.nodeType === 3) { // 文本节点
            textBeforeCursor = range.startContainer.textContent.substring(0, range.startOffset);
        } else if (range.startContainer.nodeType === 1) { // 元素节点
            // 创建一个临时范围来获取光标前的文本
            const tempRange = document.createRange();
            tempRange.setStart(range.startContainer, 0);
            tempRange.setEnd(range.startContainer, range.startOffset);
            textBeforeCursor = tempRange.toString();
        }
        
        // 检查是否正在输入标签
        const tagMatch = textBeforeCursor.match(/#([\w\u4e00-\u9fa5\/_-]*)$/);
        if (!tagMatch) return;
        
        const tagPrefix = tagMatch[1];
        
        // 保存当前光标位置信息，供点击时使用
        this._tagSuggestionCursorInfo = {
            input: input,
            startContainer: range.startContainer,
            startOffset: range.startOffset,
            tagPrefix: tagPrefix
        };
        
        // 过滤匹配的标签
        const matchingTags = Array.from(this.tags).filter(tag => 
            tag.toLowerCase().startsWith(tagPrefix.toLowerCase())
        ).slice(0, 5); // 最多显示5个建议
        
        if (matchingTags.length === 0) return;
        
        // 创建标签建议容器
        const suggestionsContainer = document.createElement('div');
        suggestionsContainer.className = 'tag-suggestions';
        suggestionsContainer.style.position = 'absolute';
        suggestionsContainer.style.backgroundColor = 'var(--bg-color)';
        suggestionsContainer.style.border = '1px solid var(--border-color)';
        suggestionsContainer.style.borderRadius = 'var(--border-radius)';
        suggestionsContainer.style.boxShadow = 'var(--shadow)';
        suggestionsContainer.style.zIndex = '1000';
        suggestionsContainer.style.maxHeight = '200px';
        suggestionsContainer.style.overflowY = 'auto';
        
        // 添加标签建议项
        matchingTags.forEach(tag => {
            const suggestionItem = document.createElement('div');
            suggestionItem.className = 'tag-suggestion-item';
            suggestionItem.style.padding = '8px 12px';
            suggestionItem.style.cursor = 'pointer';
            suggestionItem.style.transition = 'background-color var(--transition-fast)';
            suggestionItem.style.whiteSpace = 'nowrap';
            suggestionItem.innerHTML = `<span class="tag">#${tag}</span>`;
            
            suggestionItem.addEventListener('click', () => {
                this.insertSuggestedTag('#' + tag);
                this.hideTagSuggestions();
            });
            
            suggestionItem.addEventListener('mouseenter', () => {
                suggestionItem.style.backgroundColor = 'var(--bg-hover)';
            });
            
            suggestionItem.addEventListener('mouseleave', () => {
                suggestionItem.style.backgroundColor = 'transparent';
            });
            
            suggestionsContainer.appendChild(suggestionItem);
        });
        
        // 定位标签建议容器
        const rect = range.getBoundingClientRect();
        suggestionsContainer.style.left = `${rect.left}px`;
        suggestionsContainer.style.top = `${rect.bottom + window.scrollY}px`;
        
        // 添加到文档
        document.body.appendChild(suggestionsContainer);
        
        // 保存建议容器引用
        this.tagSuggestionsContainer = suggestionsContainer;
        
        // 添加点击外部关闭建议的事件
        setTimeout(() => {
            document.addEventListener('click', this.hideTagSuggestions.bind(this), { once: true });
        }, 100);
    }
    
    hideTagSuggestions() {
        if (this.tagSuggestionsContainer) {
            this.tagSuggestionsContainer.remove();
            this.tagSuggestionsContainer = null;
        }
    }
    
    insertSuggestedTag(tag) {
        // 使用保存的光标位置信息
        const cursorInfo = this._tagSuggestionCursorInfo;
        if (!cursorInfo) return;
        
        const { input, startContainer, startOffset, tagPrefix } = cursorInfo;
        
        const selection = window.getSelection();
        
        // 计算需要删除的长度（标签前缀 + #号）
        const deleteLength = tagPrefix.length + 1;
        
        // 处理不同类型的startContainer
        if (startContainer.nodeType === 3) { // 文本节点
            const textNode = startContainer;
            const safeDeleteLength = Math.min(deleteLength, startOffset);
            const newText = textNode.textContent.substring(0, startOffset - safeDeleteLength) + tag;
            textNode.textContent = newText;
            
            const newCursorPosition = startOffset - safeDeleteLength + tag.length;
            const newRange = document.createRange();
            newRange.setStart(textNode, newCursorPosition);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
        } else {
            // 对于元素节点，使用不同的方法
            // 先创建新的文本内容
            const textContent = input.innerText || input.textContent;
            
            // 从保存的startContainer获取文本
            let textBeforeCursor = '';
            const tempRange = document.createRange();
            tempRange.setStart(startContainer, 0);
            tempRange.setEnd(startContainer, startOffset);
            textBeforeCursor = tempRange.toString();
            
            // 找到标签开始的位置
            const lastTagIndex = textBeforeCursor.lastIndexOf('#');
            if (lastTagIndex !== -1) {
                // 删除从标签开始到光标位置的内容，然后插入新标签
                const beforeTag = textContent.substring(0, lastTagIndex);
                const newText = beforeTag + tag;
                input.innerText = newText;
                
                // 设置光标位置到新标签末尾
                const newCursorPosition = beforeTag.length + tag.length;
                const newRange = document.createRange();
                if (input.firstChild && input.firstChild.nodeType === 3) {
                    newRange.setStart(input.firstChild, Math.min(newCursorPosition, input.firstChild.length));
                } else {
                    newRange.setStart(input, Math.min(newCursorPosition, input.childNodes.length));
                }
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                // 如果找不到标签，直接插入
                document.execCommand('insertText', false, tag);
            }
        }
        
        // 清理保存的光标信息
        this._tagSuggestionCursorInfo = null;
        
        // 触发输入事件以更新标签预览
        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
        
        // 确保光标可见
        setTimeout(() => this.ensureCursorVisible(), 50);
    }
    
    insertSlash() {
        // 获取当前活动的编辑区域
        let input = document.querySelector('.edit-textarea');
        if (!input) {
            input = document.getElementById('noteInput');
        }
        if (input) {
            // 插入/号
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const slash = document.createTextNode('/');
                range.deleteContents();
                range.insertNode(slash);
                range.setStartAfter(slash);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                input.appendChild(document.createTextNode('/'));
                // 将光标移到/号后面
                const range = document.createRange();
                const textNode = input.lastChild;
                if (textNode) {
                    range.setStart(textNode, textNode.length);
                    range.collapse(true);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
            input.focus();
            // 确保光标可见
            setTimeout(() => this.ensureCursorVisible(), 50);
        }
    }
    
    insertLink() {
        // 获取当前活动的编辑区域
        let input = document.querySelector('.edit-textarea');
        if (!input) {
            input = document.getElementById('noteInput');
        }
        if (input) {
            // 获取当前选中的文本作为链接文本
            const selection = window.getSelection();
            const selectedText = selection.toString();
            
            // 提示用户输入链接URL
            const url = prompt('请输入链接URL:', 'http://');
            if (!url) return; // 用户取消输入
            
            // 提示用户输入链接文本，如果没有选中文本
            const linkText = selectedText || prompt('请输入链接文本:', '链接');
            if (!linkText) return; // 用户取消输入
            
            // 创建链接元素
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank'; // 在新窗口中打开链接
            link.rel = 'noopener noreferrer'; // 安全设置
            link.textContent = linkText;
            
            // 插入到编辑区
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(link);
                // 在链接后插入一个空格
                const space = document.createTextNode(' ');
                range.insertNode(space);
                range.setStartAfter(space);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                input.appendChild(link);
                input.appendChild(document.createTextNode(' '));
                // 将光标移到链接后面
                const range = document.createRange();
                const textNode = input.lastChild;
                if (textNode) {
                    range.setStart(textNode, textNode.length);
                    range.collapse(true);
                    const newSelection = window.getSelection();
                    newSelection.removeAllRanges();
                    newSelection.addRange(range);
                }
            }
            input.focus();
            // 确保光标可见
            setTimeout(() => this.ensureCursorVisible(), 50);
        }
    }

    clearAvatar() {
        if (confirm('确定要清除头像吗？')) {
            this.avatarData = '';
            localStorage.removeItem('user-avatar');
            this.loadAvatar();
            this.showToast('头像已清除', 'info');
        }
    }

    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBaseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            return await response.text();
        } catch (error) {
            console.error(`API请求失败 (${endpoint}):`, error);
            
            if (!navigator.onLine) {
                throw new Error('网络已断开，请检查网络连接后重试');
            }
            
            throw error;
        }
    }


    initResizeObserver() {
        if (window.ResizeObserver) {
            const observer = new ResizeObserver(() => {
                this.adjustScrollAreas();
            });
            
            const containers = [
                document.querySelector('.notes-list'),
                document.querySelector('.preview-list'),
                document.querySelector('.tags-cloud')
            ].filter(el => el);
            
            containers.forEach(el => observer.observe(el));
        }
    }

    adjustScrollAreas() {
        const previewList = document.querySelector('.preview-list');
        if (previewList) {
            const needsScroll = previewList.scrollHeight > previewList.clientHeight + 5;
            previewList.style.overflowY = needsScroll ? 'auto' : 'hidden';
        }
        
        const notesList = document.querySelector('.notes-list');
        if (notesList) {
            const needsScroll = notesList.scrollHeight > notesList.clientHeight + 5;
            notesList.style.overflowY = needsScroll ? 'auto' : 'hidden';
        }
        
        const tagsCloud = document.querySelector('.tags-cloud');
        if (tagsCloud) {
            const needsScroll = tagsCloud.scrollHeight > tagsCloud.clientHeight + 5;
            tagsCloud.style.overflowY = needsScroll ? 'auto' : 'hidden';
        }
    }

    async loadData() {
        try {
            const notes = await this.apiRequest('/notes');
            
            this.notes = notes;
            this.notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            const allTags = new Set();
            this.notes.forEach(note => {
                if (note.tags && Array.isArray(note.tags)) {
                    note.tags.forEach(tag => allTags.add(tag));
                }
            });
            this.tags = allTags;
        } catch (error) {
            console.error('加载数据失败:', error);
            this.notes = [];
            this.tags = new Set();
            this.showToast('加载数据失败，请检查网络连接', 'error');
        }
    }

    async saveData() {
        try {
            // 保存操作已经在各个API调用中处理
            return true;
        } catch (error) {
            console.error('保存数据失败:', error);
            this.showToast('保存失败，请重试', 'error');
            return false;
        }
    }



    bindEvents() {
        // 模式切换
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.closest('.mode-btn').dataset.mode;
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.closest('.mode-btn').classList.add('active');
                this.toggleMode(mode === 'search');
            });
        });
        
        // 工具栏按钮事件
        console.log('绑定工具栏按钮事件');
        const toolbarButtons = document.querySelectorAll('.editor-btn[data-command]');
        console.log('找到的工具栏按钮数量:', toolbarButtons.length);
        toolbarButtons.forEach(btn => {
            console.log('绑定按钮事件:', btn.dataset.command);
            btn.addEventListener('click', (e) => {
                console.log('按钮被点击:', btn.dataset.command);
                const command = btn.dataset.command;
                document.execCommand(command, false, null);
                // 移除手动切换active类的操作，让updateToolbarState函数来处理
                // 延迟执行updateToolbarState，确保命令已经执行
                setTimeout(() => this.updateToolbarState(), 10);
            });
        });
        
        // 监听选择变化，更新工具栏按钮状态
        const noteInput = document.getElementById('noteInput');
        if (noteInput) {
            // 使用 selectionchange 事件，更高效地监听选择变化
            noteInput.addEventListener('selectionchange', () => this.debounceUpdateToolbarState());
            
            // 合并键盘事件监听器
            noteInput.addEventListener('keydown', (e) => {
                // 检查是否按下了格式相关的快捷键
                if ((e.ctrlKey || e.metaKey) && ['b', 'u'].includes(e.key.toLowerCase())) {
                    // 延迟更新状态，确保命令已经执行
                    setTimeout(() => this.updateToolbarState(), 10);
                }
                // 检查是否按下了Ctrl+Enter保存笔记
                else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    this.saveNote();
                }
                // 检查是否按下了回车
                else if (e.key === 'Enter') {
                    // 先隐藏标签建议
                    this.hideTagSuggestions();
                    
                    // 处理标签确认
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        
                        // 获取光标前的文本
                        let textBeforeCursor = '';
                        if (range.startContainer.nodeType === 3) {
                            textBeforeCursor = range.startContainer.textContent.substring(0, range.startOffset);
                        } else if (range.startContainer.nodeType === 1) {
                            const tempRange = document.createRange();
                            tempRange.setStart(range.startContainer, 0);
                            tempRange.setEnd(range.startContainer, range.startOffset);
                            textBeforeCursor = tempRange.toString();
                        }
                        
                        // 检查是否有未确认的标签（#开头）
                        const tagRegex = /#([\w\u4e00-\u9fa5\/_-]*)$/;
                        const match = textBeforeCursor.match(tagRegex);
                        
                        if (match && match[1].length > 0) {
                            // 标签已输入完成，按回车时自动确认
                            // 插入空格来确认标签
                            document.execCommand('insertText', false, ' ');
                        }
                    }
                    
                    // 确保光标可见
                    setTimeout(() => this.ensureCursorVisible(), 50);
                }
                // 检查是否正在输入标签，显示标签建议
                else if (e.key.match(/[\w\u4e00-\u9fa5\/_-]/)) {
                    setTimeout(() => {
                        this.showTagSuggestions(e.target);
                    }, 100);
                }
                // 隐藏标签建议
                else if (e.key === 'Escape') {
                    this.hideTagSuggestions();
                }
            });
        }

        // 保存笔记
        document.getElementById('saveBtn').addEventListener('click', () => this.saveNote());

        // 搜索输入（防抖）
        document.getElementById('searchInput').addEventListener('input', (e) => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.currentSearch = e.target.value.trim();
                this.render();
            }, 300);
        });

        document.getElementById('clearSearchBtn').addEventListener('click', () => this.clearSearch());

        // 笔记列表事件代理
        document.getElementById('notesList').addEventListener('click', (e) => this.handleNoteListClick(e));
        
        // 双击编辑
        document.getElementById('notesList').addEventListener('dblclick', (e) => {
            const noteCard = e.target.closest('.note-card');
            if (noteCard && !noteCard.classList.contains('editing')) {
                this.startEditNote(parseInt(noteCard.dataset.noteId));
            }
        });

        // 标签云事件
        document.getElementById('tagsCloud').addEventListener('click', (e) => this.handleTagCloudClick(e));

        // 数据管理
        document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportNotes());
        document.getElementById('importFile').addEventListener('change', (e) => this.handleFileSelect(e));
        document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAllData());

        // 主题切换
        document.getElementById('toggleTheme').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleTheme();
        });

        // 快捷键帮助
        document.getElementById('shortcutHelp').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('shortcutModal').style.display = 'flex';
        });
        
        document.getElementById('closeShortcutModal').addEventListener('click', () => {
            document.getElementById('shortcutModal').style.display = 'none';
        });

        // 全局快捷键
        document.addEventListener('keydown', (e) => this.handleGlobalKeydown(e));

        // 输入预览
        document.getElementById('noteInput').addEventListener('input', (e) => {
            const content = e.target.innerHTML;
            
            this.renderTagPreview();
            
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                if (content !== this.lastProcessedContent) {
                    this.checkAndShowTagNotes(content);
                    this.lastProcessedContent = content;
                }
            }, 500);
        });

        // 点击模态框外部关闭
        document.getElementById('shortcutModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('shortcutModal')) {
                document.getElementById('shortcutModal').style.display = 'none';
            }
        });

        // 窗口大小变化
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => this.adjustScrollAreas(), 100);
        });

        // 点击页面其他地方关闭操作菜单
        document.addEventListener('click', (e) => {
            const menu = document.querySelector('.note-actions-menu');
            if (menu && !menu.contains(e.target)) {
                menu.remove();
            }
        });



        // 窗口关闭前备份提醒
        window.addEventListener('beforeunload', (e) => {
            const inputContent = document.getElementById('noteInput')?.innerHTML.trim();
            if (inputContent && inputContent !== '' && inputContent !== '<br>') {
                e.preventDefault();
                e.returnValue = '您有未保存的笔记内容。确定要离开吗？';
                return e.returnValue;
            }
        });

        // 头像相关事件
        const userAvatar = document.getElementById('userAvatar');
        const avatarUpload = document.getElementById('avatarUpload');
        
        if (userAvatar) {
            userAvatar.addEventListener('click', (e) => {
                e.stopPropagation();
                avatarUpload.click();
            });
            
            userAvatar.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.avatarData) {
                    this.clearAvatar();
                }
            });
            
            userAvatar.addEventListener('mouseenter', () => {
                const tooltip = document.createElement('div');
                tooltip.className = 'avatar-upload-tooltip';
                tooltip.textContent = this.avatarData ? '点击更换头像 (右键清除)' : '点击上传头像';
                
                const oldTooltip = document.querySelector('.avatar-upload-tooltip');
                if (oldTooltip) oldTooltip.remove();
                
                userAvatar.appendChild(tooltip);
            });
            
            userAvatar.addEventListener('mouseleave', () => {
                const tooltip = document.querySelector('.avatar-upload-tooltip');
                if (tooltip) tooltip.remove();
            });
        }
        
        if (avatarUpload) {
            avatarUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleAvatarUpload(file);
                }
                avatarUpload.value = '';
            });
        }
        
        // 附件上传事件
        const attachmentUpload = document.getElementById('attachmentUpload');
        if (attachmentUpload) {
            attachmentUpload.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    this.handleAttachmentUpload(e);
                }
                attachmentUpload.value = '';
            });
        }
    }



    handleNoteListClick(e) {
        const target = e.target;
        const noteCard = target.closest('.note-card');
        
        if (!noteCard) return;
        
        const noteId = parseInt(noteCard.dataset.noteId);
        
        if (target.classList.contains('tag') || target.closest('.tag')) {
            const tag = target.dataset.tag || target.closest('.tag')?.dataset.tag;
            if (tag) {
                e.stopPropagation();
                this.searchByTag(tag);
            }
        } 

        else if (target.classList.contains('delete-btn') || target.closest('.delete-btn')) {
            e.stopPropagation();
            this.deleteNote(noteId);
        }
        else if (target.classList.contains('expand-btn') || target.closest('.expand-btn')) {
            e.stopPropagation();
            this.expandNote(noteId);
        } 
        else if (target.classList.contains('edit-btn') || target.closest('.edit-btn')) {
            e.stopPropagation();
            this.startEditNote(noteId);
        } 
        else if (target.classList.contains('confirm-edit-btn') || target.closest('.confirm-edit-btn')) {
            e.stopPropagation();
            const editDiv = document.querySelector('.note-card.editing .edit-textarea');
            if (noteId && editDiv) {
                this.saveEditedNote(noteId, editDiv.innerHTML);
            }
        } 
        else if (target.classList.contains('cancel-edit-btn') || target.closest('.cancel-edit-btn')) {
            e.stopPropagation();
            this.cancelEdit();
        }
    }

    showNoteActions(noteId, x, y) {
        const existingMenu = document.querySelector('.note-actions-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'note-actions-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.zIndex = '1000';
        menu.innerHTML = `
            <div class="note-actions-menu-content">
                <button class="menu-item edit-menu-item" data-note-id="${noteId}">
                    <i class="material-icons">edit</i> 编辑笔记
                </button>
                <button class="menu-item delete-menu-item" data-note-id="${noteId}">
                    <i class="material-icons">delete</i> 删除笔记
                </button>
            </div>
        `;

        document.body.appendChild(menu);

        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (menuRect.right > viewportWidth) {
            menu.style.left = `${viewportWidth - menuRect.width - 10}px`;
        }
        if (menuRect.bottom > viewportHeight) {
            menu.style.top = `${viewportHeight - menuRect.height - 10}px`;
        }

        menu.querySelector('.edit-menu-item').addEventListener('click', (e) => {
            e.stopPropagation();
            this.startEditNote(noteId);
            menu.remove();
        });

        menu.querySelector('.delete-menu-item').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteNote(noteId);
            menu.remove();
        });

        menu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    handleTagCloudClick(e) {
        const target = e.target;
        
        // 先检查是否是删除按钮，如果是则直接返回（因为已经有onclick处理了）
        if (target.classList.contains('tag-delete-btn') || target.closest('.tag-delete-btn')) {
            return;
        }
        
        if (target.classList.contains('tag') || target.closest('.tag')) {
            const tag = target.dataset.tag || target.closest('.tag')?.dataset.tag;
            if (tag) this.searchByTag(tag);
        }
    }

    handleGlobalKeydown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            this.exportNotes();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            document.getElementById('importFile').click();
        }
        if (e.key === 'Escape') {
            if (this.editingNoteId !== null) {
                this.cancelEdit();
            } else if (this.isSearchMode && this.currentSearch) {
                document.getElementById('searchInput').value = '';
                this.currentSearch = '';
                this.render();
            } else if (document.getElementById('shortcutModal').style.display === 'flex') {
                document.getElementById('shortcutModal').style.display = 'none';
            }
            const menu = document.querySelector('.note-actions-menu');
            if (menu) menu.remove();
        }
        if (e.key === '/' && !e.target.matches('textarea, input, [contenteditable]')) {
            e.preventDefault();
            document.querySelector('[data-mode="search"]').click();
            document.getElementById('searchInput').focus();
        }
    }

    toggleMode(isSearchMode) {
        this.isSearchMode = isSearchMode;
        const writeArea = document.getElementById('writeArea');
        const searchArea = document.getElementById('searchArea');
        const saveBtn = document.getElementById('saveBtn');
        const noteInput = document.getElementById('noteInput');
        const searchInput = document.getElementById('searchInput');
        const tagPreviewSection = document.getElementById('tagPreviewSection');
        const tagsSection = document.querySelector('.tags-section');

        if (isSearchMode) {
            writeArea.classList.remove('active');
            searchArea.classList.add('active');
            saveBtn.innerHTML = '<i class="material-icons">clear</i> 清除搜索';
            saveBtn.classList.remove('btn-primary');
            saveBtn.classList.add('btn-secondary');
            document.getElementById('notesTitle').innerHTML = '<i class="material-icons">search</i> 搜索结果';
            
            tagsSection.style.display = 'flex';
            
            if (searchInput) {
                searchInput.focus();
                if (this.currentSearch) {
                    searchInput.value = this.currentSearch;
                }
            }
            
            tagPreviewSection.style.display = 'none';
            this.currentTagPreview = '';
            this.lastProcessedContent = '';
        } else {
            writeArea.classList.add('active');
            searchArea.classList.remove('active');
            saveBtn.innerHTML = '<i class="material-icons">save</i> 保存 (Ctrl+Enter)';
            saveBtn.classList.remove('btn-secondary');
            saveBtn.classList.add('btn-primary');
            document.getElementById('notesTitle').innerHTML = '<i class="material-icons">notes</i> 最近笔记';
            
            tagsSection.style.display = 'none';
            
            this.currentSearch = '';
            if (searchInput) searchInput.value = '';
            
            if (noteInput) {
                noteInput.focus();
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    this.checkAndShowTagNotes(noteInput.innerHTML);
                    this.lastProcessedContent = noteInput.innerHTML;
                }, 100);
            }
            
            tagPreviewSection.style.display = 'flex';
        }
        
        this.render();
        setTimeout(() => this.adjustScrollAreas(), 50);
    }

    // 去除HTML标签的辅助函数
    stripHtml(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || '';
    }

    extractTags(content) {
        // 先去除HTML标签
        const plainText = this.stripHtml(content);
        const tagRegex = /#([\w\u4e00-\u9fa5\/\-_]+)/g;
        const tags = [];
        let match;
        
        while ((match = tagRegex.exec(plainText)) !== null) {
            const tag = match[1];
            tags.push(tag);
            
            if (tag.includes('/')) {
                const parts = tag.split('/');
                let current = '';
                parts.forEach(part => {
                    current = current ? `${current}/${part}` : part;
                    if (current !== tag) tags.push(current);
                });
            }
        }
        
        return [...new Set(tags)];
    }

    checkAndShowTagNotes(content) {
        const tagRegex = /#([\w\u4e00-\u9fa5\/\-_]+)/g;
        const input = document.getElementById('noteInput');
        
        // 获取光标位置（对于contenteditable元素需要特殊处理）
        let cursorPos = 0;
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const tempDiv = document.createElement('div');
            tempDiv.appendChild(range.cloneContents());
            const textBeforeCursor = range.startContainer.textContent?.substring(0, range.startOffset) || '';
            cursorPos = textBeforeCursor.length;
        }
        
        const textBeforeCursor = content.substring(0, cursorPos);
        
        const beforeCursorMatches = textBeforeCursor.match(tagRegex);
        const lastTag = beforeCursorMatches ? beforeCursorMatches[beforeCursorMatches.length - 1] : null;
        
        if (lastTag) {
            const tagName = lastTag.substring(1);
            if (tagName !== this.currentTagPreview) {
                this.currentTagPreview = tagName;
                this.renderTagNotesPreview(tagName);
            }
        } else {
            if (this.currentTagPreview) {
                this.currentTagPreview = '';
                this.hideTagNotesPreview();
            }
        }
    }

    renderTagNotesPreview(tag) {
        const previewList = document.getElementById('previewList');
        const previewCount = document.getElementById('previewCount');
        
        const taggedNotes = this.notes.filter(note => 
            note.tags.some(noteTag => noteTag === tag || noteTag.startsWith(tag + '/'))
        );
        
        previewCount.textContent = taggedNotes.length;
        
        if (taggedNotes.length === 0) {
            previewList.innerHTML = `
                <div class="preview-empty">
                    暂无与标签 <span class="highlight-tag">#${tag}</span> 相关的笔记
                </div>
            `;
            return;
        }
        
        const displayNotes = taggedNotes.slice(0, 5);
        previewList.innerHTML = displayNotes.map(note => `
            <div class="preview-note-item" onclick="flomoApp.searchByTag('${tag}')">
                <div class="preview-note-content">${this.truncateText(this.stripHtml(note.content), 60)}</div>
                <div class="preview-note-meta">
                    <span class="preview-note-time">${this.formatTime(new Date(note.timestamp))}</span>
                </div>
            </div>
        `).join('');
        
        if (taggedNotes.length > 5) {
            previewList.innerHTML += `
                <div class="preview-more" onclick="flomoApp.searchByTag('${tag}')">
                    ...还有 ${taggedNotes.length - 5} 条相关笔记
                </div>
            `;
        }
        
        setTimeout(() => this.adjustScrollAreas(), 50);
    }

    hideTagNotesPreview() {
        document.getElementById('previewCount').textContent = '0';
        document.getElementById('previewList').innerHTML = `
            <div class="preview-empty">
                输入 #标签 预览关联笔记
            </div>
        `;
    }

    parseSearchQuery(searchQuery) {
        const timeMatch = searchQuery.match(/@(\d{4}-\d{2}-\d{2})/);
        let searchDate = null;
        let keyword = searchQuery;

        if (timeMatch) {
            const parsedDate = new Date(timeMatch[1] + 'T00:00:00');
            if (!isNaN(parsedDate.getTime())) {
                searchDate = parsedDate;
                keyword = searchQuery.replace(timeMatch[0], '').trim();
            }
        }

        return { searchDate, keyword };
    }

    async saveNote() {
        const input = document.getElementById('noteInput');
        const content = input.innerHTML.trim();
        
        if (!content || content === '<br>') {
            this.showToast('笔记内容不能为空', 'error');
            input.focus();
            return;
        }
        
        const tags = this.extractTags(content);
        
        try {
            const note = await this.apiRequest('/notes', {
                method: 'POST',
                body: JSON.stringify({ 
                    content, 
                    tags
                })
            });
            
            this.notes.unshift(note);
            tags.forEach(tag => this.tags.add(tag));
            
            input.innerHTML = '';
            this.renderTagPreview();
            this.hideTagNotesPreview();
            this.currentTagPreview = '';
            this.lastProcessedContent = '';
            this.render();
            this.showToast('笔记已保存', 'success');
            
            setTimeout(() => {
                const firstNote = document.querySelector('.note-card');
                if (firstNote) {
                    firstNote.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }, 100);
        } catch (error) {
            console.error('保存笔记失败:', error);
            this.showToast('保存失败，请重试', 'error');
        }
    }

    clearSearch() {
        if (this.isSearchMode) {
            document.getElementById('searchInput').value = '';
            this.currentSearch = '';
            this.render();
            document.getElementById('searchInput').focus();
        } else {
            const searchModeBtn = document.querySelector('[data-mode="search"]');
            if (searchModeBtn) {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                searchModeBtn.classList.add('active');
                this.toggleMode(true);
            }
        }
    }

    async deleteNote(id) {
        if (confirm('确定要删除这条笔记吗？')) {
            try {
                await this.apiRequest(`/notes/${id}`, { method: 'DELETE' });
                
                this.notes = this.notes.filter(note => note.id !== id);
                this.updateTagsFromNotes();
                this.render();
                this.showToast('笔记已删除', 'success');
            } catch (error) {
                console.error('删除笔记失败:', error);
                this.showToast('删除失败，请重试', 'error');
            }
        }
    }

    async deleteTag(tagToDelete) {
        if (confirm(`确定要删除标签 "#${tagToDelete}" 吗？\n\n这将从所有包含此标签的笔记中移除该标签。`)) {
            try {
                const notesToUpdate = this.notes.filter(note => note.tags && note.tags.includes(tagToDelete));
                
                for (const note of notesToUpdate) {
                    const updatedTags = note.tags.filter(tag => tag !== tagToDelete);
                    await this.apiRequest(`/notes/${note.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ 
                            content: note.content, 
                            tags: updatedTags 
                        })
                    });
                    note.tags = updatedTags;
                }
                
                await this.loadData();
                this.render();
                
                if (this.currentSearch === tagToDelete) {
                    this.clearSearch();
                }
                this.showToast(`标签 "#${tagToDelete}" 已删除`, 'success');
            } catch (error) {
                console.error('删除标签失败:', error);
                await this.loadData();
                this.render();
                this.showToast('删除标签失败，请重试', 'error');
            }
        }
    }

    updateTagsFromNotes() {
        const allTags = new Set();
        this.notes.forEach(note => {
            note.tags.forEach(tag => allTags.add(tag));
        });
        this.tags = allTags;
    }

    formatTime(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    filterNotes() {
        if (!this.currentSearch) return this.notes;
        
        const { searchDate, keyword } = this.parseSearchQuery(this.currentSearch);
        const keywordLower = keyword.toLowerCase();
        
        return this.notes.filter(note => {
            let dateMatch = true;
            if (searchDate) {
                const noteDate = new Date(note.timestamp);
                noteDate.setHours(0, 0, 0, 0);
                dateMatch = noteDate >= searchDate;
            }
            
            if (!searchDate && !keyword) return false;
            
            let keywordMatch = true;
            if (keyword) {
                const contentMatch = note.content.toLowerCase().includes(keywordLower);
                const tagMatch = note.tags.some(tag => tag.toLowerCase().includes(keywordLower));
                keywordMatch = contentMatch || tagMatch;
            }
            
            return dateMatch && keywordMatch;
        });
    }

    render() {
        this.renderNotes();
        this.renderTags();
        this.renderSearchTagsHint();
        this.updateStats();
        
        if (this.currentTagPreview && !this.isSearchMode) {
            this.renderTagNotesPreview(this.currentTagPreview);
        }
        
        setTimeout(() => this.adjustScrollAreas(), 50);
    }

    renderNotes() {
        const container = document.getElementById('notesList');
        const filteredNotes = this.filterNotes();
        
        if (filteredNotes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="material-icons">${this.isSearchMode ? 'search_off' : 'note_add'}</i>
                    <p>${this.isSearchMode ? '未找到匹配的笔记' : '暂无笔记，开始记录吧！'}</p>
                    ${!this.isSearchMode ? '<button class="btn btn-primary" onclick="document.getElementById(\'noteInput\').focus()">开始写笔记</button>' : ''}
                </div>
            `;
            return;
        }

        container.innerHTML = filteredNotes.map(note => {
            if (note.id === this.editingNoteId) {
                return `
                    <div class="note-card editing" data-note-id="${note.id}" style="min-height: 400px; max-height: 500px; display: flex; flex-direction: column;">                    
                        <div class="edit-textarea" contenteditable="true" placeholder="编辑笔记内容..." autofocus style="flex: 1; min-height: 120px; max-height: 180px; border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 12px; overflow-y: auto;">${note.content}</div>
                        <div class="editor-toolbar" style="margin-top: 8px;">
                            <button type="button" class="editor-btn" onclick="flomoApp.insertHashtag();">#</button>
                            <button type="button" class="editor-btn" onclick="flomoApp.insertSlash();">/</button>
                            <button type="button" class="editor-btn" data-command="bold" onclick="document.execCommand('bold', false, null); flomoApp.updateToolbarState();"><b>B</b></button>
                            <button type="button" class="editor-btn" data-command="underline" onclick="document.execCommand('underline', false, null); flomoApp.updateToolbarState();"><u>U</u></button>
                            <button type="button" class="editor-btn" data-command="insertOrderedList" onclick="document.execCommand('insertOrderedList', false, null); flomoApp.updateToolbarState();"><i class="material-icons">format_list_numbered</i></button>
                            <button type="button" class="editor-btn" onclick="flomoApp.insertLink();"><i class="material-icons">link</i></button>
                            <button type="button" class="editor-btn" onclick="document.getElementById('attachmentUpload').click();"><i class="material-icons">attach_file</i></button>
                        </div>
                        <div class="edit-actions" style="margin-top: 12px; display: flex; gap: 8px; justify-content: flex-end; flex-shrink: 0;">
                            <button class="btn btn-primary confirm-edit-btn" data-note-id="${note.id}" style="padding: 8px 16px;">
                                <i class="material-icons">save</i> 保存
                            </button>
                            <button class="btn btn-secondary cancel-edit-btn" style="padding: 8px 16px;">
                                <i class="material-icons">close</i> 取消
                            </button>
                        </div>
                    </div>
                `;
            }
            return `
                <div class="note-card" data-note-id="${note.id}">
                    <div class="note-content">
                        ${this.highlightSearch(note.content)}
                    </div>
                    <div class="note-footer">
                        <div class="note-tags">
                            ${note.tags.map(tag => `
                                <span class="tag ${tag.includes('/') ? 'tag-nested' : ''}" 
                                      data-tag="${tag}" title="点击搜索此标签">
                                    #${tag}
                                </span>
                            `).join('')}
                        </div>
                        <div class="note-actions">
                            <span class="note-time" title="${new Date(note.timestamp).toLocaleString()}">${note.timeDisplay || this.formatTime(new Date(note.timestamp))}</span>
                            <button class="btn-icon edit-btn" data-note-id="${note.id}" title="编辑 (双击卡片)">
                                <i class="material-icons">edit</i>
                            </button>
                            <button class="btn-icon delete-btn" data-note-id="${note.id}" title="删除">
                                <i class="material-icons">delete</i>
                            </button>
                            <button class="btn-icon expand-btn" data-note-id="${note.id}" title="放大查看">
                                <i class="material-icons">zoom_out_map</i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderTags() {
        const container = document.getElementById('tagsCloud');
        const sortedTags = Array.from(this.tags).sort((a, b) => {
            const countA = this.getTagCount(a);
            const countB = this.getTagCount(b);
            return countB - countA || a.localeCompare(b);
        });
        
        container.innerHTML = sortedTags.map(tag => `
            <div class="tag-item" style="animation: fadeIn 0.2s ease both;">
                <span class="tag ${tag.includes('/') ? 'tag-nested' : ''}" 
                      data-tag="${tag}" title="点击搜索此标签">
                    #${tag}
                </span>
                <span class="tag-count">${this.getTagCount(tag)}</span>
                <button class="tag-delete-btn" data-tag="${tag}" title="删除此标签">×</button>
            </div>
        `).join('');
        
        // 为所有删除按钮添加事件监听器
        container.querySelectorAll('.tag-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tag = btn.dataset.tag;
                this.deleteTag(tag);
            });
        });
        
        document.getElementById('tagCount').textContent = this.tags.size;
    }

    renderSearchTagsHint() {
        const container = document.getElementById('searchTagsHint');
        if (!this.currentSearch) {
            container.innerHTML = '';
            return;
        }
        
        const matchingTags = Array.from(this.tags).filter(tag => 
            tag.toLowerCase().includes(this.currentSearch.toLowerCase())
        );
        
        if (matchingTags.length > 0) {
            container.innerHTML = `
                <div class="hint-title">相关标签：</div>
                <div class="hint-tags">
                    ${matchingTags.slice(0, 8).map(tag => `
                        <span class="tag" data-tag="${tag}" title="点击搜索此标签">
                            #${tag}
                        </span>
                    `).join('')}
                    ${matchingTags.length > 8 ? `<span class="tag-more">等${matchingTags.length}个标签</span>` : ''}
                </div>
            `;
        } else {
            container.innerHTML = '';
        }
    }

    renderTagPreview() {
        const input = document.getElementById('noteInput');
        const container = document.getElementById('tagPreview');
        const tags = this.extractTags(input.innerHTML);
        
        container.innerHTML = tags.map(tag => `
            <span class="tag ${tag.includes('/') ? 'tag-nested' : ''}">
                #${tag}
            </span>
        `).join('');
    }

    getTagCount(tag) {
        return this.notes.filter(note => note.tags.includes(tag)).length;
    }

    searchByTag(tag) {
        document.querySelector('[data-mode="search"]').click();
        document.getElementById('searchInput').value = tag;
        this.currentSearch = tag;
        this.render();
    }

    highlightSearch(text) {
        const { keyword } = this.parseSearchQuery(this.currentSearch);
        if (!keyword) return text;
        
        const searchLower = keyword.toLowerCase();
        const textLower = text.toLowerCase();
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        const plainText = tempDiv.textContent || tempDiv.innerText || '';
        
        if (!plainText.toLowerCase().includes(searchLower)) return text;
        
        const escapedText = text;
        
        const parts = [];
        let lastIndex = 0;
        let index = plainText.toLowerCase().indexOf(searchLower);
        
        while (index !== -1) {
            parts.push(text.substring(lastIndex, index));
            parts.push(`<mark>${text.substring(index, index + keyword.length)}</mark>`);
            lastIndex = index + keyword.length;
            index = plainText.toLowerCase().indexOf(searchLower, lastIndex);
        }
        
        parts.push(text.substring(lastIndex));
        return parts.join('');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    startEditNote(noteId) {
        this.editingNoteId = noteId;
        this.render();
        
        setTimeout(() => {
            const editDiv = document.querySelector('.note-card.editing .edit-textarea');
            if (editDiv) {
                editDiv.focus();
                const range = document.createRange();
                range.selectNodeContents(editDiv);
                range.collapse(false);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                editDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // 移除旧的事件监听器，避免累积
                const oldHandlers = editDiv._eventHandlers || [];
                oldHandlers.forEach(handler => {
                    editDiv.removeEventListener('keydown', handler);
                });
                
                // 定义新的事件处理函数
                const handleKeydown = (e) => {
                    // 检查是否按下了格式相关的快捷键
                    if ((e.ctrlKey || e.metaKey) && ['b', 'u'].includes(e.key.toLowerCase())) {
                        setTimeout(() => this.updateToolbarState(), 10);
                    }
                    // 检查是否按下了回车
                    else if (e.key === 'Enter') {
                        // 先隐藏标签建议
                        this.hideTagSuggestions();
                        
                        // 处理标签确认
                        const selection = window.getSelection();
                        if (selection.rangeCount > 0) {
                            const range = selection.getRangeAt(0);
                            
                            // 获取光标前的文本
                            let textBeforeCursor = '';
                            if (range.startContainer.nodeType === 3) {
                                textBeforeCursor = range.startContainer.textContent.substring(0, range.startOffset);
                            } else if (range.startContainer.nodeType === 1) {
                                const tempRange = document.createRange();
                                tempRange.setStart(range.startContainer, 0);
                                tempRange.setEnd(range.startContainer, range.startOffset);
                                textBeforeCursor = tempRange.toString();
                            }
                            
                            // 检查是否有未确认的标签（#开头）
                            const tagRegex = /#([\w\u4e00-\u9fa5\/_-]*)$/;
                            const match = textBeforeCursor.match(tagRegex);
                            
                            if (match && match[1].length > 0) {
                                // 标签已输入完成，按回车时自动确认
                                // 插入空格来确认标签
                                document.execCommand('insertText', false, ' ');
                            }
                        }
                        
                        // 确保光标可见
                        setTimeout(() => this.ensureCursorVisible(), 50);
                    }
                    // 检查是否正在输入标签，显示标签建议
                    else if (e.key.match(/[\w\u4e00-\u9fa5\/_-]/)) {
                        setTimeout(() => {
                            this.showTagSuggestions(e.target);
                        }, 100);
                    }
                    // 隐藏标签建议
                    else if (e.key === 'Escape') {
                        this.hideTagSuggestions();
                    }
                };
                
                // 保存事件处理函数引用，以便后续移除
                editDiv._eventHandlers = [handleKeydown];
                
                // 添加新的事件监听器
                editDiv.addEventListener('keydown', handleKeydown);
                
                // 移除旧的selectionchange监听器
                const oldSelectionHandlers = editDiv._selectionHandlers || [];
                oldSelectionHandlers.forEach(handler => {
                    editDiv.removeEventListener('selectionchange', handler);
                });
                
                // 定义新的selectionchange处理函数
                const handleSelectionChange = () => this.debounceUpdateToolbarState();
                
                // 保存事件处理函数引用
                editDiv._selectionHandlers = [handleSelectionChange];
                
                // 添加新的selectionchange监听器
                editDiv.addEventListener('selectionchange', handleSelectionChange);
            }
        }, 50);
    }

    async saveEditedNote(noteId, newContent) {
        const content = newContent.trim();
        if (!content || content === '<br>') {
            this.showToast('笔记内容不能为空', 'error');
            return;
        }
        
        const noteIndex = this.notes.findIndex(note => note.id === noteId);
        if (noteIndex !== -1) {
            const oldContent = this.notes[noteIndex].content;
            
            if (content === oldContent) {
                this.cancelEdit();
                return;
            }
            
            // 保存编辑历史
            this.saveEditHistory(noteId, oldContent, this.notes[noteIndex].timestamp);
            
            const tags = this.extractTags(content);
            
            try {
                // 保留原始时间戳
                const originalTimestamp = this.notes[noteIndex].timestamp;
                
                const updatedNote = await this.apiRequest(`/notes/${noteId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ content, tags, timestamp: originalTimestamp })
                });
                
                // 确保使用原始时间戳
                updatedNote.timestamp = originalTimestamp;
                this.notes[noteIndex] = updatedNote;
                this.updateTagsFromNotes();
                
                this.notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                this.editingNoteId = null;
                this.render();
                this.showToast('笔记已更新', 'success');
            } catch (error) {
                console.error('更新笔记失败:', error);
                this.showToast('更新失败，请重试', 'error');
            }
        }
    }
    
    // 保存编辑历史
    saveEditHistory(noteId, content, timestamp) {
        try {
            const historyKey = `edit_history_${noteId}`;
            const existingHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
            
            // 添加新的历史记录到数组开头，确保最新的记录在前面
            existingHistory.unshift({
                content: content,
                timestamp: timestamp,
                editedAt: new Date().toISOString()
            });
            
            // 限制历史记录数量，最多保存10条
            if (existingHistory.length > 10) {
                existingHistory.pop();
            }
            
            localStorage.setItem(historyKey, JSON.stringify(existingHistory));
        } catch (error) {
            console.error('保存编辑历史失败:', error);
        }
    }
    
    // 获取编辑历史
    getEditHistory(noteId) {
        try {
            const historyKey = `edit_history_${noteId}`;
            return JSON.parse(localStorage.getItem(historyKey) || '[]');
        } catch (error) {
            console.error('获取编辑历史失败:', error);
            return [];
        }
    }

    cancelEdit() {
        this.editingNoteId = null;
        this.render();
    }

    expandNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        // 创建放大查看的模态框
        const modal = document.createElement('div');
        modal.className = 'note-expand-modal';
        modal.innerHTML = `
            <div class="note-expand-content">
                <div class="note-expand-header">
                    <h3><i class="material-icons">fullscreen</i> 笔记详情</h3>
                    <button class="btn-icon close-expand-btn" title="关闭">
                        <i class="material-icons">close</i>
                    </button>
                </div>
                <div class="note-expand-body">
                    <div class="note-expand-text">${note.content}</div>
                    <div class="note-expand-tags">
                        ${note.tags.map(tag => `
                            <span class="tag ${tag.includes('/') ? 'tag-nested' : ''}" data-tag="${tag}">
                                #${tag}
                            </span>
                        `).join('')}
                    </div>
                </div>
                <div class="note-expand-footer">
                    <span class="note-expand-time">
                        <i class="material-icons">schedule</i>
                        ${new Date(note.timestamp).toLocaleString()}
                    </span>
                    <div class="note-expand-actions">
                        <button class="btn btn-secondary view-history-btn" data-note-id="${note.id}">
                            <i class="material-icons">history</i> 编辑历史
                        </button>
                        <button class="btn btn-secondary close-expand-btn">
                            <i class="material-icons">close</i> 关闭
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定关闭事件
        modal.querySelectorAll('.close-expand-btn').forEach(btn => {
            btn.addEventListener('click', () => this.closeExpandModal(modal));
        });

        // 点击模态框背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeExpandModal(modal);
            }
        });

        // 标签点击事件
        modal.querySelectorAll('.tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                const tagName = e.target.dataset.tag;
                if (tagName) {
                    this.closeExpandModal(modal);
                    this.searchByTag(tagName);
                }
            });
        });
        
        // 编辑历史按钮事件
        modal.querySelector('.view-history-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const noteId = parseInt(e.target.closest('.view-history-btn').dataset.noteId);
            this.showEditHistory(noteId);
        });

        // ESC键关闭
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                this.closeExpandModal(modal);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        // 显示动画
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });
    }

    closeExpandModal(modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
    
    // 显示编辑历史
    showEditHistory(noteId) {
        const history = this.getEditHistory(noteId);
        
        // 创建编辑历史模态框
        const modal = document.createElement('div');
        modal.className = 'note-expand-modal';
        modal.innerHTML = `
            <div class="note-expand-content">
                <div class="note-expand-header">
                    <h3><i class="material-icons">history</i> 编辑历史</h3>
                    <button class="btn-icon close-history-btn" title="关闭">
                        <i class="material-icons">close</i>
                    </button>
                </div>
                <div class="note-expand-body">
                    ${history.length > 0 ? `
                        <div class="history-list">
                            ${history.map((item, index) => `
                                <div class="history-item" data-index="${index}">
                                    <div class="history-header">
                                        <span class="history-index">版本 ${index + 1}</span>
                                        <span class="history-time">
                                            编辑时间: ${new Date(item.editedAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <div class="history-content">${item.content}</div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="empty-history">
                            <i class="material-icons">history_off</i>
                            <p>暂无编辑历史记录</p>
                        </div>
                    `}
                </div>
                <div class="note-expand-footer">
                    <div class="note-expand-actions">
                        <button class="btn btn-secondary close-history-btn">
                            <i class="material-icons">close</i> 关闭
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 绑定关闭事件
        modal.querySelectorAll('.close-history-btn').forEach(btn => {
            btn.addEventListener('click', () => this.closeExpandModal(modal));
        });
        
        // 点击模态框背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeExpandModal(modal);
            }
        });
        
        // ESC键关闭
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                this.closeExpandModal(modal);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
        
        // 显示动画
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });
    }

    exportNotes() {
        try {
            let notesToExport = this.notes;
            let exportFileName = 'flomo-lite-backup';
            
            if (this.isSearchMode && this.currentSearch) {
                notesToExport = this.filterNotes();
                exportFileName = `flomo-lite-search-${this.currentSearch.replace('/', '-')}`;
            }
            
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                noteCount: notesToExport.length,
                tagCount: this.tags.size,
                notes: notesToExport,
                tags: Array.from(this.tags),
                source: 'Flomo Lite Web App',
                ...(this.isSearchMode && this.currentSearch && { searchQuery: this.currentSearch })
            };
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const dateStr = new Date().toISOString().split('T')[0];
            a.download = `${exportFileName}-${dateStr}.json`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showToast(`导出成功！共导出 ${notesToExport.length} 条笔记`, 'success');
            
        } catch (error) {
            console.error('导出失败:', error);
            this.showToast('导出失败，请重试', 'error');
        }
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.name.endsWith('.json')) {
            this.showToast('请选择JSON格式的文件', 'error');
            event.target.value = '';
            return;
        }
        
        if (file.size > 10 * 1024 * 1024) {
            this.showToast('文件过大，请选择小于10MB的文件', 'error');
            event.target.value = '';
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                
                if (!importedData.notes || !Array.isArray(importedData.notes)) {
                    throw new Error('无效的数据格式：缺少notes数组');
                }
                
                const noteCount = importedData.notes.length;
                const tagCount = importedData.tags ? importedData.tags.length : 0;
                
                if (!confirm(`确认导入 ${noteCount} 条笔记吗？\n\n导入将会合并数据，不会删除现有笔记。`)) {
                    event.target.value = '';
                    return;
                }
                
                const existingNotes = await this.apiRequest('/notes');
                
                let addedNotes = 0;
                for (const note of importedData.notes) {
                    try {
                        const isDuplicate = existingNotes.some(existingNote => 
                            existingNote.content === note.content
                        );
                        
                        if (!isDuplicate) {
                            await this.apiRequest('/notes', {
                                method: 'POST',
                                body: JSON.stringify({
                                    content: note.content,
                                    tags: note.tags || []
                                })
                            });
                            
                            addedNotes++;
                        }
                    } catch (error) {
                        console.error('导入单个笔记失败:', error);
                    }
                }
                
                // 重新加载数据
                await this.loadData();
                
                event.target.value = '';
                this.render();
                
                let message = '导入成功！';
                if (addedNotes > 0) message += ` 新增 ${addedNotes} 条笔记`;
                
                this.showToast(message, 'success');
                
            } catch (error) {
                console.error('导入失败:', error);
                this.showToast(`导入失败：${error.message}`, 'error');
                event.target.value = '';
            }
        };
        
        reader.onerror = () => {
            this.showToast('读取文件失败，请重试', 'error');
            event.target.value = '';
        };
        
        reader.readAsText(file);
    }

    async clearAllData() {
        if (confirm('⚠️  警告！这将清空所有笔记和标签，且不可恢复。确定继续吗？')) {
            try {
                for (const note of this.notes) {
                    await this.apiRequest(`/notes/${note.id}`, { method: 'DELETE' });
                }
                
                await this.loadData();
                
                this.currentSearch = '';
                this.editingNoteId = null;
                this.currentTagPreview = '';
                this.lastProcessedContent = '';
                this.render();
                this.showToast('所有数据已清空', 'info');
            } catch (error) {
                console.error('清空数据失败:', error);
                this.showToast('清空数据失败，请重试', 'error');
            }
        }
    }

    updateStats() {
        const filteredNotes = this.filterNotes();
        document.getElementById('notesCount').textContent = filteredNotes.length;
        
        const filterIndicator = document.getElementById('filterIndicator');
        if (this.isSearchMode && this.currentSearch) {
            filterIndicator.innerHTML = `（筛选: ${this.currentSearch}） <span id="exportSearchBtn" style="margin-left: 10px; cursor: pointer; color: var(--primary-color); display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; border-radius: var(--border-radius-sm); transition: background-color var(--transition-fast);" title="导出搜索结果"><i class="material-icons" style="font-size: 14px;">download</i> 导出</span>`;
            filterIndicator.style.display = 'inline';
            
            // 添加导出按钮点击事件
            document.getElementById('exportSearchBtn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.exportNotes();
            });
            
            // 添加悬停效果
            document.getElementById('exportSearchBtn').addEventListener('mouseenter', function() {
                this.style.backgroundColor = 'var(--primary-light)';
            });
            
            document.getElementById('exportSearchBtn').addEventListener('mouseleave', function() {
                this.style.backgroundColor = 'transparent';
            });
        } else {
            filterIndicator.style.display = 'none';
        }
        
        const avatarNotesBadge = document.getElementById('avatarNotesBadge');
        if (avatarNotesBadge) {
            avatarNotesBadge.textContent = this.notes.length;
        }
    }

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('flomo-theme', this.theme);
        this.applyTheme();
        
        const toggleThemeBtn = document.getElementById('toggleTheme');
        if (toggleThemeBtn) {
            const icon = toggleThemeBtn.querySelector('.material-icons');
            if (icon) {
                icon.textContent = this.theme === 'light' ? 'dark_mode' : 'light_mode';
            }
        }
    }

    applyTheme() {
        document.body.setAttribute('data-theme', this.theme);
        this.showToast(`已切换到 ${this.theme === 'light' ? '浅色' : '深色'} 主题`, 'info');
    }

    showToast(message, type = 'info', duration = 3000) {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.whiteSpace = 'pre-line';
        
        const iconMap = {
            'success': 'check_circle',
            'error': 'error',
            'warning': 'warning',
            'info': 'info'
        };
        
        toast.innerHTML = `
            <i class="material-icons">${iconMap[type] || 'info'}</i>
            <span>${message}</span>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 10);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    
    debounceUpdateToolbarState() {
        // 减少防抖延迟时间，提高响应速度
        clearTimeout(this.toolbarUpdateTimer);
        this.toolbarUpdateTimer = setTimeout(() => {
            this.updateToolbarState();
        }, 20);
    }
    
    updateToolbarState() {
        const commands = ['bold', 'underline', 'insertOrderedList'];
        
        // 确定当前活动的编辑区域
        const activeEditArea = document.querySelector('.edit-textarea') || document.getElementById('noteInput');
        if (!activeEditArea) return;
        
        // 获取当前活动编辑区域对应的工具栏
        let toolbar;
        if (activeEditArea.classList.contains('edit-textarea')) {
            // 编辑卡片的工具栏
            toolbar = activeEditArea.nextElementSibling;
        } else {
            // 编辑区的工具栏 - 找到包含noteInput的容器的下一个兄弟元素
            const noteInputContainer = document.getElementById('noteInput222');
            if (noteInputContainer) {
                toolbar = noteInputContainer.nextElementSibling;
            } else {
                toolbar = document.querySelector('.editor-toolbar');
            }
        }
        
        if (!toolbar) return;
        
        // 只更新当前工具栏中的按钮状态
        commands.forEach(command => {
            const button = toolbar.querySelector(`.editor-btn[data-command="${command}"]`);
            if (button) {
                try {
                    const isActive = document.queryCommandState(command);
                    if (isActive) {
                        button.classList.add('active');
                    } else {
                        button.classList.remove('active');
                    }
                } catch (error) {
                    // 忽略命令状态检查错误
                }
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.flomoApp = new FlomoWebApp();
    
    // 添加全局函数用于测试链接功能
    window.testInsertLink = function() {
        alert('testInsertLink called');
        console.log('testInsertLink called');
        window.flomoApp.insertLink();
    };
});