// Flomo Lite - 网页版应用逻辑 (带智能静默自动备份功能)
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
        this.lastProcessedContent = '';
        this.resizeTimer = null;
        this.avatarData = localStorage.getItem('user-avatar') || '';
        
        this.init();
    }

    async init() {
        await this.loadData();
        this.bindEvents();
        this.applyTheme();
        this.toggleMode(false);
        this.render();
        this.initResizeObserver();
        this.loadAvatar();
    }

    // 加载头像
    loadAvatar() {
        const avatarImage = document.getElementById('avatarImage');
        const avatarPlaceholder = document.getElementById('avatarPlaceholder');
        const avatarNotesBadge = document.getElementById('avatarNotesBadge');
        
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

    // 处理头像上传
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

    // 清除头像
    clearAvatar() {
        if (confirm('确定要清除头像吗？')) {
            this.avatarData = '';
            localStorage.removeItem('user-avatar');
            this.loadAvatar();
            this.showToast('头像已清除', 'info');
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
            // 从API获取笔记数据
            const notesResponse = await fetch('http://localhost:8080/api/notes');
            if (!notesResponse.ok) throw new Error('Failed to load notes');
            const notes = await notesResponse.json();
            
            // 从API获取标签数据
            const tagsResponse = await fetch('http://localhost:8080/api/tags');
            if (!tagsResponse.ok) throw new Error('Failed to load tags');
            const tags = await tagsResponse.json();
            
            this.notes = notes;
            this.tags = new Set(tags);
            
            this.notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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

        // 保存笔记
        document.getElementById('saveBtn').addEventListener('click', () => this.saveNote());
        
        // 快捷键保存
        document.getElementById('noteInput').addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.saveNote();
            }
        });

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
            const content = e.target.value;
            
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
            const inputContent = document.getElementById('noteInput')?.value.trim();
            if (inputContent && inputContent !== '') {
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
        else if (target.classList.contains('edit-btn') || target.closest('.edit-btn')) {
            e.stopPropagation();
            this.startEditNote(noteId);
        } 
        else if (target.classList.contains('confirm-edit-btn') || target.closest('.confirm-edit-btn')) {
            e.stopPropagation();
            const textarea = document.querySelector('.note-card.editing textarea');
            if (noteId && textarea) {
                this.saveEditedNote(noteId, textarea.value);
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
        if (target.classList.contains('tag') || target.closest('.tag')) {
            const tag = target.dataset.tag || target.closest('.tag')?.dataset.tag;
            if (tag) this.searchByTag(tag);
        } 
        else if (target.classList.contains('tag-delete-btn') || target.closest('.tag-delete-btn')) {
            const tag = target.dataset.tag || target.closest('[data-tag]')?.dataset.tag;
            if (tag) this.deleteTag(tag);
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
                    this.checkAndShowTagNotes(noteInput.value);
                    this.lastProcessedContent = noteInput.value;
                }, 100);
            }
            
            tagPreviewSection.style.display = 'flex';
        }
        
        this.render();
        setTimeout(() => this.adjustScrollAreas(), 50);
    }

    extractTags(content) {
        const tagRegex = /#([\w\u4e00-\u9fa5\/\-_]+)/g;
        const tags = [];
        let match;
        
        while ((match = tagRegex.exec(content)) !== null) {
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
        const cursorPos = input.selectionStart;
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
                <div class="preview-note-content">${this.truncateText(this.escapeHtml(note.content), 60)}</div>
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
        const content = input.value.trim();
        
        if (!content) {
            this.showToast('笔记内容不能为空', 'error');
            input.focus();
            return;
        }
        
        const tags = this.extractTags(content);
        
        try {
            console.log('开始保存笔记...');
            console.log('内容:', content);
            console.log('标签:', tags);
            
            // 直接使用完整的URL
            const response = await fetch('http://localhost:8080/api/notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content, tags })
            });
            
            console.log('响应状态:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('保存失败:', errorText);
                throw new Error(`保存失败: ${errorText}`);
            }
            
            const note = await response.json();
            console.log('保存成功，返回笔记:', note);
            
            this.notes.unshift(note);
            tags.forEach(tag => this.tags.add(tag));
            
            // 直接调用saveData，不需要await
            if (this.saveData()) {
                input.value = '';
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
            }
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
                const response = await fetch(`http://localhost:8080/api/notes/${id}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) throw new Error('删除失败');
                
                this.notes = this.notes.filter(note => note.id !== id);
                this.updateTagsFromNotes();
                if (this.saveData()) {
                    this.render();
                    this.showToast('笔记已删除', 'success');
                }
            } catch (error) {
                console.error('删除笔记失败:', error);
                this.showToast('删除失败，请重试', 'error');
            }
        }
    }

    async deleteTag(tagToDelete) {
        if (confirm(`确定要删除标签 "#${tagToDelete}" 吗？\n\n这将从所有包含此标签的笔记中移除该标签。`)) {
            try {
                // 找到所有包含该标签的笔记
                const notesToUpdate = this.notes.filter(note => note.tags.includes(tagToDelete));
                
                // 为每个笔记更新标签
                for (const note of notesToUpdate) {
                    const updatedTags = note.tags.filter(tag => tag !== tagToDelete);
                    await fetch(`http://localhost:8080/api/notes/${note.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ 
                            content: note.content, 
                            tags: updatedTags 
                        })
                    });
                }
                
                // 重新加载数据
                await this.loadData();
                
                if (this.currentSearch === tagToDelete) {
                    this.clearSearch();
                }
                this.showToast(`标签 "#${tagToDelete}" 已删除`, 'success');
            } catch (error) {
                console.error('删除标签失败:', error);
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
                    <div class="note-card editing" data-note-id="${note.id}" style="min-height: 300px; max-height: 400px;">
                        <textarea class="edit-textarea" placeholder="编辑笔记内容..." autofocus style="min-height: 180px; max-height: 250px;">${this.escapeHtml(note.content)}</textarea>
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
                    <div class="note-content">${this.highlightSearch(note.content)}</div>
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
                            <span class="note-time" title="${new Date(note.timestamp).toLocaleString()}">${note.timeDisplay}</span>
                            <button class="btn-icon edit-btn" data-note-id="${note.id}" title="编辑 (双击卡片)">
                                <i class="material-icons">edit</i>
                            </button>
                            <button class="btn-icon delete-btn" data-note-id="${note.id}" title="删除">
                                <i class="material-icons">delete</i>
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
        const tags = this.extractTags(input.value);
        
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
        if (!keyword) return this.escapeHtml(text);
        
        const searchLower = keyword.toLowerCase();
        const textLower = text.toLowerCase();
        const escapedText = this.escapeHtml(text);
        
        if (!textLower.includes(searchLower)) return escapedText;
        
        const parts = [];
        let lastIndex = 0;
        let index = textLower.indexOf(searchLower);
        
        while (index !== -1) {
            parts.push(escapedText.substring(lastIndex, index));
            parts.push(`<mark>${escapedText.substring(index, index + keyword.length)}</mark>`);
            lastIndex = index + keyword.length;
            index = textLower.indexOf(searchLower, lastIndex);
        }
        
        parts.push(escapedText.substring(lastIndex));
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
            const textarea = document.querySelector('.note-card.editing textarea');
            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 50);
    }

    async saveEditedNote(noteId, newContent) {
        const content = newContent.trim();
        if (!content) {
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
            
            const tags = this.extractTags(content);
            
            try {
                const response = await fetch(`http://localhost:8080/api/notes/${noteId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content, tags })
                });
                
                if (!response.ok) throw new Error('更新失败');
                
                const updatedNote = await response.json();
                
                this.notes[noteIndex] = updatedNote;
                this.updateTagsFromNotes();
                
                this.notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                if (this.saveData()) {
                    this.editingNoteId = null;
                    this.render();
                    this.showToast('笔记已更新', 'success');
                }
            } catch (error) {
                console.error('更新笔记失败:', error);
                this.showToast('更新失败，请重试', 'error');
            }
        }
    }

    cancelEdit() {
        this.editingNoteId = null;
        this.render();
    }

    exportNotes() {
        try {
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                noteCount: this.notes.length,
                tagCount: this.tags.size,
                notes: this.notes,
                tags: Array.from(this.tags),
                source: 'Flomo Lite Web App'
            };
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const dateStr = new Date().toISOString().split('T')[0];
            a.download = `flomo-lite-backup-${dateStr}.json`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showToast(`导出成功！共导出 ${this.notes.length} 条笔记`, 'success');
            
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
                
                let addedNotes = 0;
                for (const note of importedData.notes) {
                    try {
                        const response = await fetch('/api/notes', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                content: note.content,
                                tags: note.tags || []
                            })
                        });
                        
                        if (response.ok) {
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
                // 逐个删除所有笔记
                for (const note of this.notes) {
                    await fetch(`/api/notes/${note.id}`, {
                        method: 'DELETE'
                    });
                }
                
                // 重新加载数据
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
            filterIndicator.textContent = `（筛选: ${this.currentSearch}）`;
            filterIndicator.style.display = 'inline';
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
}

document.addEventListener('DOMContentLoaded', () => {
    window.flomoApp = new FlomoWebApp();
});