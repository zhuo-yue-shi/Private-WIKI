// 1. 获取Cookie的工具函数
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

function setCookie(name, value, days = 7) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax`;
}

// 全局变量：当前用户信息
let currentUser = {
    email: '',
    uuid: '',
    username: '', // 新增：用户名
    isAnonymous: true // 新增：是否匿名
};

// 新增：根据UUID/Email查询用户名
async function getUsername(Supabase, userId = '', userEmail = '') {
    if (!Supabase) return '未知用户';
    try {
        // 优先按UUID查
        let query = Supabase.from('users').select('username');
        if (userId) {
            query = query.eq('id', userId);
        } else if (userEmail) {
            // 若有email，可扩展users表增加email字段，这里先按UUID查（需确保users.id = supabase user.id）
            return '未知用户'; 
        }
        const { data, error } = await query.single();
        if (error || !data) return '未知用户';
        return data.username;
    } catch (err) {
        console.error('查询用户名失败：', err);
        return '未知用户';
    }
}

// 2. 初始化Supabase（修复匿名登录，新增用户名查询）
async function initSupabase() {
    const apiKey = getCookie('apiKey');
    const isAnonymous = getCookie('isAnonymous') === 'true'; // 读取匿名标识
    const supabaseUrl = 'https://lveyzrryikhijvnrxhlo.supabase.co';

    if (!apiKey) {
        window.location.href = 'login/';
        return null;
    }

    await new Promise(resolve => {
        const checkSupabase = setInterval(() => {
            if (window.supabase && supabase.createClient) {
                clearInterval(checkSupabase);
                resolve();
            }
        }, 50);
    });

    const Supabase = supabase.createClient(supabaseUrl, apiKey);
    
    // 匿名登录：不检查auth，直接标记
    if (isAnonymous) {
        currentUser.isAnonymous = true;
        currentUser.username = '匿名用户';
        currentUser.email = 'anonymous@example.com';
        document.getElementById('userEmail').textContent = '匿名用户';
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('createWikiBtn').style.display = 'none';
        return Supabase;
    }

    // 账号登录：检查auth并查询用户名
    try {
        const { data: { user } } = await Supabase.auth.getUser();
        if (user) {
            currentUser.isAnonymous = false;
            currentUser.email = user.email;
            currentUser.uuid = user.id;
            // 查询用户名
            currentUser.username = await getUsername(Supabase, user.id);
            // 右上角显示：用户名（邮箱）
            document.getElementById('userEmail').textContent = `${currentUser.username}（${currentUser.email}）`;
            document.getElementById('userInfo').style.display = 'flex';
        } else {
            // 账号登录但无user，仍允许访问（降级为匿名）
            currentUser.isAnonymous = true;
            currentUser.username = '匿名用户';
            document.getElementById('userEmail').textContent = '匿名用户';
            document.getElementById('userInfo').style.display = 'flex';
        }
    } catch (err) {
        // auth检查失败，允许匿名访问
        currentUser.isAnonymous = true;
        currentUser.username = '匿名用户';
        document.getElementById('userEmail').textContent = '匿名用户';
        document.getElementById('userInfo').style.display = 'flex';
        console.warn('用户认证检查失败，降级为匿名访问：', err);
    }

    return Supabase;
}

// 3. 渲染文档列表（修改创建人显示为用户名）
async function fetchWikiDocuments(Supabase) {
    const tableContainer = document.getElementById('tableContainer');
    
    try {
        const { data, error } = await Supabase
            .from('document')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;

        if (!data || data.length === 0) {
            tableContainer.innerHTML = `
                <div class="empty-state">
                    <h3>暂无文档</h3>
                    <p>点击"新建WIKI文档"创建第一个文档吧</p>
                </div>
            `;
            return;
        }

        // 批量查询所有创建人的用户名
        const creatorUuids = [...new Set(data.map(item => item.created_by_uuid))];
        const creatorNameMap = {};
        for (const uuid of creatorUuids) {
            creatorNameMap[uuid] = await getUsername(Supabase, uuid);
        }

        let tableHtml = `
            <table class="wiki-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>标题</th>
                        <th>创建人</th>
                        <th>创建时间</th>
                        <th>内容类型</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach(item => {
            const formattedTime = new Date(item.created_at).toLocaleString('zh-CN');
            let typeTag = '';
            if (item.content_type === 1) {
                typeTag = '<span class="content-type-tag type-markdown">Markdown</span>';
            } else if (item.content_type === 2) {
                typeTag = '<span class="content-type-tag type-html">HTML</span>';
            } else {
                typeTag = '<span class="content-type-tag">未知</span>';
            }
            // 显示创建人用户名（无则显示未知用户）
            const creatorName = creatorNameMap[item.created_by_uuid] || '未知用户';

            tableHtml += `
                <tr onclick="window.location.href='wiki/?id=${item.id}'">
                    <td>${item.id}</td>
                    <td>${item.title || '无标题'}</td>
                    <td>${creatorName}</td>
                    <td>${formattedTime}</td>
                    <td>${typeTag}</td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;

        tableContainer.innerHTML = tableHtml;

    } catch (error) {
        console.error('查询文档列表失败：', error.message);
        tableContainer.innerHTML = `
            <div class="empty-state">
                <h3>加载失败</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// 4. 新建WIKI文档逻辑（无修改，仅保留）
async function initCreateWiki(Supabase) {
    const createBtn = document.getElementById('createWikiBtn');
    const modal = document.getElementById('createModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelCreateBtn');
    const submitBtn = document.getElementById('submitCreateBtn');
    const newTitle = document.getElementById('newTitle');
    const newContentType = document.getElementById('newContentType');
    const newContent = document.getElementById('newContent');
    const createError = document.getElementById('createError');

    // 打开模态框（优化动画）
    createBtn.addEventListener('click', () => {
        modal.classList.add('show'); // 替换display:flex为动画类
        newTitle.value = '';
        newContent.value = '';
        createError.style.display = 'none';
    });

    // 关闭模态框
    const closeModal = () => {
        modal.classList.remove('show');
        createError.style.display = 'none';
    };
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // 点击遮罩层关闭模态框
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // 提交新建文档
    submitBtn.addEventListener('click', async () => {
        const title = newTitle.value.trim();
        const contentType = parseInt(newContentType.value);
        const content = newContent.value.trim();

        // 验证输入
        if (!title) {
            createError.textContent = '请输入文档标题';
            createError.style.display = 'block';
            return;
        }
        if (!content) {
            createError.textContent = '请输入文档内容';
            createError.style.display = 'block';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '提交中...';
        createError.style.display = 'none';

        try {
            // 插入数据到Supabase
            const { data, error } = await Supabase
                .from('document')
                .insert([{
                    title: title,
                    content_type: contentType,
                    content: content,
                    created_by: currentUser.email,
                    created_by_uuid: currentUser.uuid || 'anonymous', // 匿名用anonymous标识
                    created_at: new Date().toISOString()
                }])
                .select();

            if (error) throw error;

            // 关闭模态框 + 刷新列表 + 自定义提示
            closeModal();
            await fetchWikiDocuments(Supabase);
            await customAlert('文档创建成功！', '创建成功'); // 替换alert

        } catch (error) {
            console.error('创建文档失败：', error.message);
            createError.textContent = `创建失败：${error.message}`;
            createError.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '提交';
        }
    });
}

// 5. 退出登录逻辑（优化匿名退出）
function initLogout(Supabase) {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', async () => {
        // 替换confirm为自定义弹窗
        const confirmLogout = await customConfirm('确定要退出登录吗？', '退出确认');
        if (!confirmLogout) return;

        // 账号登录：退出Supabase auth
        if (!currentUser.isAnonymous) {
            await Supabase.auth.signOut().catch(err => console.warn('退出auth失败：', err));
        }

        // 清除所有Cookie
        document.cookie = 'apiKey=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'supabaseUserId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'supabaseEmail=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'isAnonymous=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        
        // 跳转登录页
        window.location.href = 'login/';
    });
}

// 6. 页面初始化入口
document.addEventListener('DOMContentLoaded', async function() {
    // 先加载自定义弹窗工具
    await import('./modal-utils.js').catch(() => {
        console.warn('模态框工具加载失败，使用原生提示框');
    });

    const Supabase = await initSupabase();
    if (!Supabase) return;

    // 渲染文档列表
    await fetchWikiDocuments(Supabase);

    // 初始化新建功能
    initCreateWiki(Supabase);

    // 初始化退出登录
    initLogout(Supabase);
});