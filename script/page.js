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

// 4. 加载文档详情（核心修改：匿名用户仅允许访问column=all的文档）
async function loadWikiDetail() {
    const docId = getUrlParam('id');
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const detailContainer = document.getElementById('detailContainer');
    const docActions = document.getElementById('docActions');

    if (!docId || isNaN(docId)) {
        loadingState.style.display = 'none';
        errorState.innerHTML = '<h3>参数错误</h3><p>无效的文档ID</p>';
        errorState.style.display = 'block';
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
        detailContainer.style.display = 'block';

        document.getElementById('docTitle').textContent = data.title || '无标题';
        document.getElementById('docCreator').textContent = creatorName;
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

    } catch (error) {
        loadingState.style.display = 'none';
        errorState.innerHTML = `<h3>加载失败</h3><p>${error.message}</p>`;
        errorState.style.display = 'block';
        console.error('加载文档失败：', error);
    }
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

// 6. 页面加载执行（无修改）
document.addEventListener('DOMContentLoaded', async () => {
    await import('./modal-utils.js').catch(() => {
        console.warn('模态框工具加载失败，使用原生提示框');
    });
    loadWikiDetail();
});