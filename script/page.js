// 1. 获取Cookie工具函数
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

// 2. 获取URL中的ID参数
function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

// 全局变量：当前用户信息 + 文档信息
let currentUser = {
    uuid: '',
    email: '',
    username: '',
    isAnonymous: true
};
let currentDoc = {};
let Supabase = null;

// 新增：根据UUID查询用户名
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

// 3. 初始化Supabase（适配匿名登录）
async function initSupabase() {
    const apiKey = getCookie('apiKey');
    const isAnonymous = getCookie('isAnonymous') === 'true';
    if (!apiKey) {
        throw new Error('未获取到API Key');
    }

    await new Promise(resolve => {
        const checkSupabase = setInterval(() => {
            if (window.supabase && supabase.createClient) { // 修正：检查window.supabase存在
                clearInterval(checkSupabase);
                resolve();
            }
        }, 50);
    });

    const supabaseUrl = 'https://lveyzrryikhijvnrxhlo.supabase.co'; // 修正：小写supabase域名
    Supabase = supabase.createClient(supabaseUrl, apiKey); // 大写命名避免冲突

    // 匿名登录：不检查auth
    if (isAnonymous) {
        currentUser.isAnonymous = true;
        currentUser.username = '匿名用户';
        return Supabase;
    }

    // 账号登录：获取用户信息
    try {
        const { data: { user } } = await Supabase.auth.getUser();
        if (user) {
            currentUser.isAnonymous = false;
            currentUser.uuid = user.id;
            currentUser.email = user.email;
            currentUser.username = await getUsername(Supabase, user.id);
        }
    } catch (err) {
        console.warn('用户认证检查失败：', err);
        currentUser.isAnonymous = true;
        currentUser.username = '匿名用户';
    }

    return Supabase;
}

// 4. 加载文档详情（修改创建人显示为用户名）
async function loadWikiDetail() {
    const docId = getUrlParam('id');
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const detailContainer = document.getElementById('detailContainer');
    const docActions = document.getElementById('docActions');

    // 校验参数
    if (!docId || isNaN(docId)) {
        loadingState.style.display = 'none';
        errorState.innerHTML = '<h3>参数错误</h3><p>无效的文档ID</p>';
        errorState.style.display = 'block';
        return;
    }

    try {
        // 初始化Supabase
        await initSupabase();

        // 查询文档
        const { data, error } = await Supabase
            .from('document')
            .select('*')
            .eq('id', docId)
            .single();

        if (error) throw error;
        if (!data) throw new Error('未找到该文档');

        // 存储当前文档信息
        currentDoc = data;

        // 查询创建人用户名
        const creatorName = await getUsername(Supabase, data.created_by_uuid);

        // 渲染文档信息
        loadingState.style.display = 'none';
        detailContainer.style.display = 'block';

        // 基本信息
        document.getElementById('docTitle').textContent = data.title || '无标题';
        document.getElementById('docCreator').textContent = creatorName; // 仅显示用户名
        document.getElementById('docTime').textContent = new Date(data.created_at).toLocaleString('zh-CN');
        
        // 内容类型标签
        let typeTag = '';
        if (data.content_type === 1) {
            typeTag = '<span class="meta-tag type-markdown">Markdown</span>';
        } else if (data.content_type === 2) {
            typeTag = '<span class="meta-tag type-html">HTML</span>';
        } else {
            typeTag = '<span class="meta-tag">未知类型</span>';
        }
        document.getElementById('docType').innerHTML = typeTag;

        // 渲染内容
        const contentContainer = document.getElementById('docContent');
        if (data.content_type === 1) {
            contentContainer.innerHTML = marked.parse(data.content || '无内容');
        } else if (data.content_type === 2) {
            contentContainer.innerHTML = data.content || '无内容';
        } else {
            contentContainer.textContent = data.content || '无内容';
        }

        // 判断是否为创建者，显示操作按钮
        if (data.created_by_uuid === currentUser.uuid && !currentUser.isAnonymous) {
            docActions.style.display = 'flex';
            // 初始化编辑/删除功能
            initEditDelete();
        }

    } catch (error) {
        loadingState.style.display = 'none';
        errorState.innerHTML = `<h3>加载失败</h3><p>${error.message}</p>`;
        errorState.style.display = 'block';
        console.error('加载文档失败：', error);
    }
}

// 5. 初始化编辑/删除功能（无核心修改，仅保留）
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

    // 填充编辑表单
    const fillEditForm = () => {
        editDocId.value = currentDoc.id;
        editTitle.value = currentDoc.title || '';
        editContentType.value = currentDoc.content_type || 1;
        editContent.value = currentDoc.content || '';
        editError.style.display = 'none';
    };

    // 打开编辑模态框（优化动画）
    editBtn.addEventListener('click', () => {
        editModal.classList.add('show');
        fillEditForm();
    });

    // 关闭编辑模态框
    const closeEditModal = () => {
        editModal.classList.remove('show');
        editError.style.display = 'none';
    };
    closeEditBtn.addEventListener('click', closeEditModal);
    cancelEditBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });

    // 保存编辑内容
    saveEditBtn.addEventListener('click', async () => {
        const docId = editDocId.value;
        const title = editTitle.value.trim();
        const contentType = parseInt(editContentType.value);
        const content = editContent.value.trim();

        // 验证输入
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
            // 更新Supabase数据
            const { error } = await Supabase
                .from('document')
                .update({
                    title: title,
                    content_type: contentType,
                    content: content
                })
                .eq('id', docId)
                .eq('created_by_uuid', currentUser.uuid); // 仅创建者可修改

            if (error) throw error;

            // 关闭模态框 + 刷新页面 + 自定义提示
            closeEditModal();
            await customAlert('文档修改成功！', '修改成功'); // 替换alert
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

    // 删除文档
    deleteBtn.addEventListener('click', async () => {
        // 替换confirm为自定义弹窗
        const confirmDelete = await customConfirm(
            '确定要删除该文档吗？删除后无法恢复！', 
            '删除确认'
        );
        if (!confirmDelete) return;

        try {
            const { error } = await Supabase
                .from('document')
                .delete()
                .eq('id', currentDoc.id)
                .eq('created_by_uuid', currentUser.uuid); // 仅创建者可删除

            if (error) throw error;

            await customAlert('文档删除成功！', '删除成功'); // 替换alert
            window.location.href = '../'; // 跳转回列表页

        } catch (error) {
            console.error('删除文档失败：', error.message);
            await customAlert(`删除失败：${error.message}`, '删除失败'); // 替换alert
        }
    });
}

// 6. 页面加载执行
document.addEventListener('DOMContentLoaded', async () => {
    // 先加载自定义弹窗工具
    await import('./modal-utils.js').catch(() => {
        console.warn('模态框工具加载失败，使用原生提示框');
    });
    loadWikiDetail();
});