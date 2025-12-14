let currentDocId = ''; // 当前文档ID

// 新增：HTML特殊字符转义函数（防止内容被解析为标签）
function escapeHtml(unsafeStr) {
    if (!unsafeStr) return '';
    return unsafeStr
        .replace(/&/g, "\\&amp;")   // & → &amp;
        .replace(/</g, "\\&lt;")    // < → &lt;
        .replace(/>/g, "\\&gt;")    // > → &gt;
        .replace(/"/g, "\\&quot;")  // " → &quot;
        .replace(/'/g, "\\&#039;") // ' → &#039;
        .replace(/\n/g, "\\"); // ' → &#039;
}

// 1. 获取Cookie工具函数（无修改）
function getCookie(name) {
    const cookieArr = document.cookie.split('; ');
    for (let cookie of cookieArr) {
        const [cookieName, cookieValue] = cookie.split('=');
        if (cookieName === name) {
            return decodeURIComponent(cookieValue);
        }
    }
    return null;
}

// 2. 获取URL中的ID参数（无修改）
function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

// 全局变量：当前用户信息 + 文档信息（无修改）
let currentUser = {
    uuid: '',
    email: '',
    username: '',
    isAnonymous: true,
    visit: [],
    admin: []
};
let currentDoc = {};
let Supabase = null;

// 新增：当前编辑的评论ID（全局）
let currentEditCommentId = '';

// 新增：查询用户完整信息（含权限）（无修改）
async function getUserFullInfo(Supabase, userId = '') {
    if (!Supabase || !userId) return null;
    try {
        const { data, error } = await Supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        if (error || !data) return null;
        return data;
    } catch (err) {
        console.error('查询用户完整信息失败：', err);
        return null;
    }
}

// 根据UUID查询用户名（无修改）
async function getUsername(Supabase, userId = '') {
    if (!Supabase || !userId) return '未知用户';
    try {
        const { data, error } = await Supabase
            .from('users')
            .select('username')
            .eq('id', userId)
            .single();
        if (error || !data) return '未知用户';
        return data.username;
    } catch (err) {
        console.error('查询用户名失败：', err);
        return '未知用户';
    }
}

// 3. 初始化Supabase（无修改，保持匿名用户配置）
async function initSupabase() {
    const apiKey = getCookie('apiKey');
    const isAnonymous = getCookie('isAnonymous') === 'true';
    if (!apiKey) {
        throw new Error('未获取到API Key');
    }

    await new Promise(resolve => {
        const checkSupabase = setInterval(() => {
            if (window.supabase && supabase.createClient) {
                clearInterval(checkSupabase);
                resolve();
            }
        }, 50);
    });

    const supabaseUrl = 'https://lveyzrryikhijvnrxhlo.supabase.co';
    Supabase = supabase.createClient(supabaseUrl, apiKey);

    if (isAnonymous) {
        currentUser.isAnonymous = true;
        currentUser.username = '匿名用户';
        currentUser.visit = [];
        currentUser.admin = [];
        return Supabase;
    }

    try {
        const { data: { user } } = await Supabase.auth.getUser();
        if (user) {
            currentUser.isAnonymous = false;
            currentUser.uuid = user.id;
            currentUser.email = user.email;

            const userFullInfo = await getUserFullInfo(Supabase, user.id);
            if (userFullInfo) {
                currentUser.username = userFullInfo.username || '未知用户';
                currentUser.visit = userFullInfo.visit || [];
                currentUser.admin = userFullInfo.admin || [];
            } else {
                currentUser.username = '未知用户';
                currentUser.visit = [];
                currentUser.admin = [];
            }
        }
    } catch (err) {
        console.warn('用户认证检查失败：', err);
        currentUser.isAnonymous = true;
        currentUser.username = '匿名用户';
        currentUser.visit = [];
        currentUser.admin = [];
    }

    return Supabase;
}

// 新增：判断是否有文档操作权限（无修改，匿名用户默认无操作权限）
function hasDocPermission(doc) {
    if (currentUser.isAnonymous) return false;
    if (doc.created_by_uuid === currentUser.uuid) return true;
    if (currentUser.admin.includes(doc.column)) return true;
    if (doc.column === 'all' && currentUser.admin.length > 0) return true;
    return false;
}

// 新增：判断是否有评论操作权限（仅评论创建者可编辑/删除）
async function hasCommentPermission(comment) {
    if (currentUser.isAnonymous) return false;
    // 追溯评论的文档的column
    let docColumn = comment.column;
    if (docColumn === 'all') {
        // 追溯评论的文档的column
        const { data, error } = await Supabase
            .from('document')
            .select('column')
            .eq('id', comment.document_id)
            .single();
        if (error || !data) return false;
        docColumn = data.column;
    }

    return comment.created_by_uuid === currentUser.uuid || currentUser.admin.includes(docColumn);
}

// 4. 加载文档详情（核心修改：匿名用户仅允许访问column=all的文档）
async function loadWikiDetail() {
    const docId = getUrlParam('id');
    currentDocId = docId; 
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const detailContainer = document.getElementById('detailContainer');
    const docActions = document.getElementById('docActions');

    if (!docId || isNaN(docId)) {
        loadingState.style.display = 'none';
        errorState.innerHTML = '<h3>参数错误</h3><p>无效的文档ID</p>';
        errorState.style.display = 'flex';
        return;
    }

    try {
        await initSupabase();

        const { data, error } = await Supabase
            .from('document')
            .select('*')
            .eq('id', docId)
            .single();

        if (error) throw error;
        if (!data) throw new Error('未找到该文档');

        // 核心修改：匿名用户访问权限判断
        let canAccess = false;
        if (currentUser.isAnonymous) {
            // 匿名用户：仅允许访问column=all的文档
            canAccess = data.column === 'all';
        } else {
            // 账号用户：原有权限逻辑
            canAccess =
                currentUser.visit.includes(data.column) ||
                data.column === 'all' && currentUser.visit.length > 0;
        }

        if (!canAccess) {
            throw new Error('无权限访问该文档');
        }

        currentDoc = data;
        const creatorName = await getUsername(Supabase, data.created_by_uuid);

        loadingState.style.display = 'none';
        detailContainer.style.display = 'flex';

        document.getElementById('docTitle').textContent = data.title || '无标题';
        document.getElementById('docCreator').textContent = creatorName;
        document.getElementById('docCreator').onclick = () => {
            goToUserPage(data.created_by_uuid);
        };
        document.getElementById('docTime').textContent = new Date(data.created_at).toLocaleString('zh-CN');

        let typeTag = '';
        if (data.content_type === 1) {
            typeTag = '<span class="meta-tag type-markdown">Markdown</span>';
        } else if (data.content_type === 2) {
            typeTag = '<span class="meta-tag type-html">HTML</span>';
        } else {
            typeTag = '<span class="meta-tag">未知类型</span>';
        }
        const columnName = data.column === 'all' ? '全部板块' : data.column;
        document.getElementById('docType').innerHTML = `${typeTag} <span class="meta-tag" style="background-color: #f5f5f5; color: #4a5568;">${columnName}</span>`;

        const contentContainer = document.getElementById('docContent');
        if (data.content_type === 1) {
            contentContainer.innerHTML = marked.parse(data.content || '无内容');
        } else if (data.content_type === 2) {
            contentContainer.innerHTML = data.content || '无内容';
        } else {
            contentContainer.textContent = data.content || '无内容';
        }

        if (hasDocPermission(data)) {
            docActions.style.display = 'flex';
            initEditDelete();
        } else {
            docActions.style.display = 'none';
        }

        // 初始化评论编辑模态框事件
        initEditCommentModal();

    } catch (error) {
        loadingState.style.display = 'none';
        errorState.innerHTML = `<h3>加载失败</h3><p>${error.message}</p>`;
        errorState.style.display = 'block';
        console.error('加载文档失败：', error);
    }

    // 文档加载成功后，加载评论（调用新的评论加载函数）
    await loadCommentsByColumn();
}

// 5. 初始化编辑/删除功能（无修改，匿名用户无操作权限）
function initEditDelete() {
    const editBtn = document.getElementById('editBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const editModal = document.getElementById('editModal');
    const closeEditBtn = document.getElementById('closeEditBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const saveEditBtn = document.getElementById('saveEditBtn');
    const editDocId = document.getElementById('editDocId');
    const editTitle = document.getElementById('editTitle');
    const editContentType = document.getElementById('editContentType');
    const editContent = document.getElementById('editContent');
    const editError = document.getElementById('editError');

    const fillEditForm = () => {
        editDocId.value = currentDoc.id;
        editTitle.value = currentDoc.title || '';
        editContentType.value = currentDoc.content_type || 1;
        editContent.value = currentDoc.content || '';
        editError.style.display = 'none';
    };

    editBtn.addEventListener('click', () => {
        editModal.classList.add('show');
        fillEditForm();
    });

    const closeEditModal = () => {
        editModal.classList.remove('show');
        editError.style.display = 'none';
    };
    closeEditBtn.addEventListener('click', closeEditModal);
    cancelEditBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });

    saveEditBtn.addEventListener('click', async () => {
        const docId = editDocId.value;
        const title = editTitle.value.trim();
        const contentType = parseInt(editContentType.value);
        const content = editContent.value.trim();

        if (!title) {
            editError.textContent = '请输入文档标题';
            editError.style.display = 'block';
            return;
        }
        if (!content) {
            editError.textContent = '请输入文档内容';
            editError.style.display = 'block';
            return;
        }

        saveEditBtn.disabled = true;
        saveEditBtn.textContent = '保存中...';
        editError.style.display = 'none';

        try {
            const { error } = await Supabase
                .from('document')
                .update({
                    title: title,
                    content_type: contentType,
                    content: content
                })
                .eq('id', docId);

            if (error) throw error;

            closeEditModal();
            await customAlert('文档修改成功！', '修改成功');
            window.location.reload();

        } catch (error) {
            console.error('修改文档失败：', error.message);
            editError.textContent = `修改失败：${error.message}`;
            editError.style.display = 'block';
        } finally {
            saveEditBtn.disabled = false;
            saveEditBtn.textContent = '保存修改';
        }
    });

    deleteBtn.addEventListener('click', async () => {
        const confirmDelete = await customConfirm(
            '确定要删除该文档吗？删除后无法恢复！',
            '删除确认'
        );
        if (!confirmDelete) return;

        try {
            const { error } = await Supabase
                .from('document')
                .delete()
                .eq('id', currentDoc.id);

            if (error) throw error;

            await customAlert('文档删除成功！', '删除成功');
            window.location.href = '../';

        } catch (error) {
            console.error('删除文档失败：', error.message);
            await customAlert(`删除失败：${error.message}`, '删除失败');
        }
    });
}

// 新增：初始化评论编辑模态框事件
function initEditCommentModal() {
    const editCommentModal = document.getElementById('editCommentModal');
    const closeEditCommentBtn = document.getElementById('closeEditCommentBtn');
    const cancelEditCommentBtn = document.getElementById('cancelEditCommentBtn');
    const saveEditCommentBtn = document.getElementById('saveEditCommentBtn');
    const editCommentError = document.getElementById('editCommentError');

    // 关闭模态框
    const closeModal = () => {
        editCommentModal.classList.remove('show');
        editCommentError.style.display = 'none';
        currentEditCommentId = '';
        document.getElementById('editCommentContent').value = '';
    };

    closeEditCommentBtn.addEventListener('click', closeModal);
    cancelEditCommentBtn.addEventListener('click', closeModal);
    editCommentModal.addEventListener('click', (e) => {
        if (e.target === editCommentModal) closeModal();
    });

    // 保存评论修改
    saveEditCommentBtn.addEventListener('click', async () => {
        const content = document.getElementById('editCommentContent').value.trim();
        if (!content) {
            editCommentError.textContent = '请输入评论内容';
            editCommentError.style.display = 'block';
            return;
        }

        if (!currentEditCommentId) {
            editCommentError.textContent = '无效的评论ID';
            editCommentError.style.display = 'block';
            return;
        }

        saveEditCommentBtn.disabled = true;
        saveEditCommentBtn.textContent = '保存中...';
        editCommentError.style.display = 'none';

        try {
            const { error } = await Supabase
                .from('document')
                .update({ content: content })
                .eq('id', currentEditCommentId);

            if (error) throw error;

            closeModal();
            await customAlert('评论修改成功！', '成功');
            await loadCommentsByColumn(); // 重新加载评论

        } catch (err) {
            console.error('编辑评论失败：', err);
            editCommentError.textContent = `修改失败：${err.message}`;
            editCommentError.style.display = 'block';
        } finally {
            saveEditCommentBtn.disabled = false;
            saveEditCommentBtn.textContent = '保存修改';
        }
    });
}

// 6. 页面加载执行（无修改）
document.addEventListener('DOMContentLoaded', async () => {
    await import('./modal-utils.js').catch(() => {
        console.warn('模态框工具加载失败，使用原生提示框');
    });
    loadWikiDetail();
});

// 新增：跳转个人主页函数
function goToUserPage(uuid = '') {
    const targetUuid = uuid || currentUser.uuid;
    if (!targetUuid) {
        customAlert('匿名用户无个人主页', '提示');
        return;
    }
    window.location.href = `../user?id=${targetUuid}`;
}

// 修复：按column层级加载评论（核心修正解构错误+增加调试日志）
async function loadCommentsByColumn() {
    const commentListEl = document.getElementById('commentList');
    const commentFormEl = document.getElementById('commentForm');
    const anonymousTipEl = document.getElementById('anonymousTip');

    // 打印调试日志
    console.log('=== 加载评论调试信息 ===');
    console.log('当前文档ID：', currentDocId);
    console.log('查询column：', `page-${currentDocId}`);
    console.log('当前用户是否匿名：', currentUser.isAnonymous);

    // 权限控制（不变）
    if (currentUser.isAnonymous) {
        anonymousTipEl.classList.remove('hidden');
        commentFormEl.classList.add('hidden');
    } else {
        anonymousTipEl.classList.add('hidden');
        commentFormEl.classList.remove('hidden');
        document.getElementById('submitCommentBtn').onclick = submitCommentByColumn;
    }

    try {
        // 核心修复：正确解构Supabase返回的data和error
        const { data: rootComments, error } = await Supabase
            .from('document')
            .select('*')
            .eq('column', `page-${currentDocId}`)
            .order('created_at', { ascending: true });

        // 打印查询结果
        console.log('一级评论查询结果：', rootComments);
        console.log('查询错误：', error);

        if (error) throw error;
        if (!rootComments || rootComments.length === 0) {
            commentListEl.innerHTML = '<li class="no-comment">暂无评论，快来发表第一条评论吧～</li>';
            return;
        }

        // 第二步：递归加载所有子评论并渲染
        const commentsWithChildren = await buildCommentTree(rootComments);
        console.log('带子评论的完整评论树：', commentsWithChildren);
        
        // 渲染评论树
        const commentHtml = await renderCommentTree(commentsWithChildren);
        console.log('渲染的评论HTML：', commentHtml);
        commentListEl.innerHTML = commentHtml;

    } catch (err) {
        console.error('加载评论失败：', err);
        commentListEl.innerHTML = `<li class="no-comment">评论加载失败：${err.message}</li>`;
    }
}

// 修复：递归构建评论树（加载子评论）+ 调试日志
async function buildCommentTree(comments) {
    const commentTree = [];
    for (const comment of comments) {
        console.log(`加载评论${comment.id}的子评论，column=page-${comment.id}`);
        
        // 加载当前评论的子评论（column=page-[当前评论ID]）
        const { data: children, error } = await Supabase
            .from('document')
            .select('*')
            .eq('column', `page-${comment.id}`)
            .order('created_at', { ascending: true });

        if (error) {
            console.warn(`加载评论${comment.id}的子评论失败：`, error);
            commentTree.push({ ...comment, children: [] });
            continue;
        }

        console.log(`评论${comment.id}的子评论：`, children);
        
        // 递归加载子评论的子评论
        const childrenWithSub = await buildCommentTree(children || []);
        commentTree.push({ ...comment, children: childrenWithSub });
    }
    return commentTree;
}

// 核心修改：渲染评论树时添加编辑/删除按钮（仅创建者可见）
async function renderCommentTree(commentTree) {
    let html = '';
    for (const comment of commentTree) {
        const commentAuthor = await getUsername(Supabase, comment.created_by_uuid) || '未知用户';
        const createTime = new Date(comment.created_at).toLocaleString('zh-CN');
        // 判断是否有评论操作权限
        const hasPermission = hasCommentPermission(comment);
        
        // 评论操作按钮（编辑/删除）
        let actionBtns = '';
        if (hasPermission) {
            actionBtns = `
                <span class="comment-edit-btn" onclick="showEditCommentForm(${comment.id}, '${escapeHtml(comment.content) || ''}')">编辑</span>
                <span class="comment-delete-btn" onclick="deleteCommentByColumn(${comment.id})">删除</span>
            `;
        }

        html += `
            <li class="comment-item" data-comment-id="${comment.id}">
                <div class="comment-meta">
                    <span class="comment-author" onclick="goToUserPage('${comment.created_by_uuid}')">${commentAuthor}</span>
                    <span class="comment-time">${createTime}</span>
                </div>
                <div class="comment-content">${comment.content || '无内容'}</div>
                <div class="comment-actions">
                    ${actionBtns}
                    <span class="comment-reply-btn" onclick="showReplyForm(${comment.id})">回复</span>
                </div>
                <!-- 回复表单 -->
                <div class="comment-reply-form" id="replyForm-${comment.id}" style="display: none;">
                    <textarea class="comment-reply-textarea" id="replyContent-${comment.id}" placeholder="请输入回复内容..."></textarea>
                    <button class="comment-reply-submit" onclick="submitReplyByColumn(${comment.id})">发布回复</button>
                    <button class="comment-reply-cancel" onclick="hideReplyForm(${comment.id})">取消</button>
                </div>
                <!-- 子评论列表 -->
                ${comment.children.length > 0 ? `<ul class="comment-children">${await renderCommentTree(comment.children)}</ul>` : ''}
            </li>
        `;
    }
    return html;
}

// 保留：显示/隐藏回复表单（无修改）
function showReplyForm(commentId) {
    document.querySelectorAll('.comment-reply-form').forEach(el => el.style.display = 'none');
    const replyForm = document.getElementById(`replyForm-${commentId}`);
    replyForm.style.display = 'block';
    document.getElementById(`replyContent-${commentId}`).focus();
}

function hideReplyForm(commentId) {
    const replyForm = document.getElementById(`replyForm-${commentId}`);
    replyForm.style.display = 'none';
    document.getElementById(`replyContent-${commentId}`).value = '';
}

// 新增：显示评论编辑表单
function showEditCommentForm(commentId, content) {
    currentEditCommentId = commentId;
    document.getElementById('editCommentId').value = commentId;
    document.getElementById('editCommentContent').value = content;
    document.getElementById('editCommentModal').classList.add('show');
    document.getElementById('editCommentContent').focus();
}

// 新增：删除评论函数
async function deleteCommentByColumn(commentId) {
    const confirmDelete = await customConfirm(
        '确定要删除该评论吗？删除后无法恢复！',
        '删除评论确认'
    );
    if (!confirmDelete) return;

    try {
        // 1. 先删除子评论（递归删除所有子评论）
        await deleteCommentChildren(commentId);
        
        // 2. 删除当前评论
        const { error } = await Supabase
            .from('document')
            .delete()
            .eq('id', commentId);

        if (error) throw error;

        await customAlert('评论删除成功！', '成功');
        await loadCommentsByColumn(); // 重新加载评论

    } catch (err) {
        console.error('删除评论失败：', err);
        customAlert(`删除失败：${err.message}`, '失败');
    }
}

// 新增：递归删除子评论
async function deleteCommentChildren(parentCommentId) {
    // 查询子评论
    const { data: children, error } = await Supabase
        .from('document')
        .select('id')
        .eq('column', `page-${parentCommentId}`);

    if (error) {
        console.warn(`查询评论${parentCommentId}的子评论失败：`, error);
        return;
    }

    if (children && children.length > 0) {
        // 递归删除子评论的子评论
        for (const child of children) {
            await deleteCommentChildren(child.id);
            // 删除当前子评论
            await Supabase.from('document').delete().eq('id', child.id);
        }
    }
}

// 新增：发布一级评论（按column规则）
async function submitCommentByColumn() {
    const content = document.getElementById('newCommentContent').value.trim();
    if (!content) {
        customAlert('请输入评论内容', '提示');
        return;
    }

    try {
        console.log('发布一级评论，column=', `page-${currentDocId}`);
        
        // 一级评论：column=page-[文档ID]
        const { data, error } = await Supabase
            .from('document')
            .insert([{
                title: `评论-${Date.now()}`, // 仅填充，无实际意义
                column: `page-${currentDocId}`, // 关联当前文档
                content_type: 2, // 纯文本
                content: content,
                created_by: currentUser.email,
                created_by_uuid: currentUser.uuid,
                created_at: new Date().toISOString()
            }])
            .select();

        if (error) throw error;

        console.log('评论发布成功，返回数据：', data);
        
        document.getElementById('newCommentContent').value = '';
        await loadCommentsByColumn(); // 重新加载评论树
        customAlert('评论发布成功！', '成功');

    } catch (err) {
        console.error('发布评论失败：', err);
        customAlert(`发布失败：${err.message}`, '失败');
    }
}

// 新增：发布子评论（按column规则）
async function submitReplyByColumn(parentCommentId) {
    const content = document.getElementById(`replyContent-${parentCommentId}`).value.trim();
    if (!content) {
        customAlert('请输入回复内容', '提示');
        return;
    }

    try {
        console.log('发布子评论，column=', `page-${parentCommentId}`);
        
        // 子评论：column=page-[父评论ID]
        const { data, error } = await Supabase
            .from('document')
            .insert([{
                title: `回复-${Date.now()}`,
                column: `page-${parentCommentId}`, // 关联父评论
                content_type: 2,
                content: content,
                created_by: currentUser.email,
                created_by_uuid: currentUser.uuid,
                created_at: new Date().toISOString()
            }])
            .select();

        if (error) throw error;

        console.log('回复发布成功，返回数据：', data);
        
        hideReplyForm(parentCommentId);
        await loadCommentsByColumn(); // 重新加载评论树
        customAlert('回复发布成功！', '成功');

    } catch (err) {
        console.error('发布回复失败：', err);
        customAlert(`回复失败：${err.message}`, '失败');
    }
}