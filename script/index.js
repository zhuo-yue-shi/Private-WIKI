// 1. 获取Cookie的工具函数（无修改）
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

// 全局变量：当前用户信息 + 板块信息（新增匿名用户默认板块）
let currentUser = {
    email: '',
    uuid: '',
    username: '',
    isAnonymous: true,
    visit: [], // 可访问板块（匿名用户为空，单独处理all）
    admin: []  // 管理员板块（匿名用户为空）
};
let currentSection = ''; // 当前选中板块
let allSections = [];    // 所有可访问板块

// 新增：根据UUID查询用户完整信息（含权限）（无修改）
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

// 新增：根据UUID/Email查询用户名（无修改）
async function getUsername(Supabase, userId = '', userEmail = '') {
    if (!Supabase) return '未知用户';
    try {
        let query = Supabase.from('users').select('username');
        if (userId) {
            query = query.eq('id', userId);
        } else if (userEmail) {
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

// 2. 初始化Supabase（调整匿名用户配置）
async function initSupabase() {
    const apiKey = getCookie('apiKey');
    const isAnonymous = getCookie('isAnonymous') === 'true';
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
    
    // 匿名用户：默认可查看all板块，无其他权限
    if (isAnonymous) {
        currentUser.isAnonymous = true;
        currentUser.username = '匿名用户';
        currentUser.visit = []; // 空数组，单独处理all板块
        currentUser.admin = [];
        document.getElementById('userEmail').textContent = '匿名用户';
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('createWikiBtn').style.display = 'none'; // 匿名用户无新建权限
        return Supabase;
    }

    // 账号登录：检查auth并查询用户完整信息（含权限）（无修改）
    try {
        const { data: { user } } = await Supabase.auth.getUser();
        if (user) {
            currentUser.isAnonymous = false;
            currentUser.email = user.email;
            currentUser.uuid = user.id;
            
            // 查询用户完整信息（含visit/admin权限）
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

            // 右上角显示：用户名（邮箱）
            document.getElementById('userEmail').textContent = `${currentUser.username}（${currentUser.email}）`;
            document.getElementById('userInfo').style.display = 'flex';
            
            // 有访问权限才显示新建按钮
            if (currentUser.visit.length > 0) {
                document.getElementById('createWikiBtn').style.display = 'block';
            } else {
                document.getElementById('createWikiBtn').style.display = 'none';
            }
        } else {
            // 账号登录但无user，降级为匿名
            currentUser.isAnonymous = true;
            currentUser.username = '匿名用户';
            currentUser.visit = [];
            currentUser.admin = [];
            document.getElementById('userEmail').textContent = '匿名用户';
            document.getElementById('userInfo').style.display = 'flex';
            document.getElementById('createWikiBtn').style.display = 'none';
        }
    } catch (err) {
        // auth检查失败，降级为匿名
        currentUser.isAnonymous = true;
        currentUser.username = '匿名用户';
        currentUser.visit = [];
        currentUser.admin = [];
        document.getElementById('userEmail').textContent = '匿名用户';
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('createWikiBtn').style.display = 'none';
        console.warn('用户认证检查失败，降级为匿名访问：', err);
    }

    return Supabase;
}

// 新增：渲染板块标签页（核心修改：匿名用户显示“全部板块”）
async function renderSectionTabs(Supabase) {
    const sectionTabsContainer = document.getElementById('sectionTabs');
    
    // 匿名用户：仅显示“全部板块”标签
    if (currentUser.isAnonymous) {
        allSections = ['all']; // 匿名用户仅可查看all板块
        currentSection = 'all'; // 默认选中“全部板块”
        sectionTabsContainer.innerHTML = `<button class="section-tab active" data-section="all">全部板块</button>`;
        
        // 绑定匿名用户标签点击事件（防止切换异常）
        document.querySelector('.section-tab').addEventListener('click', function() {
            currentSection = 'all';
            fetchWikiDocuments(Supabase);
        });
        return;
    }

    // 账号用户：按visit权限渲染标签（原有逻辑）
    allSections = [...currentUser.visit];
    if (allSections.length === 0) {
        sectionTabsContainer.innerHTML = '<div class="no-section-permission">暂无可访问的板块</div>';
        currentSection = '';
        return;
    }

    if (!currentSection) {
        currentSection = allSections[0];
    }

    let tabsHtml = '';
    allSections.forEach(section => {
        const isActive = section === currentSection ? 'active' : '';
        tabsHtml += `<button class="section-tab ${isActive}" data-section="${section}">${section}</button>`;
    });
    sectionTabsContainer.innerHTML = tabsHtml;

    document.querySelectorAll('.section-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentSection = this.dataset.section;
            fetchWikiDocuments(Supabase);
        });
    });
}

// 3. 渲染文档列表（核心修改：匿名用户仅查询all板块）
async function fetchWikiDocuments(Supabase) {
    const tableContainer = document.getElementById('tableContainer');
    
    // 匿名用户：仅查询column=all的文档
    if (currentUser.isAnonymous) {
        try {
            const { data, error } = await Supabase
                .from('document')
                .select('*')
                .eq('column', 'all')
                .order('created_at', { ascending: false });
            
            if (error) throw error;

            if (!data || data.length === 0) {
                tableContainer.innerHTML = `
                    <div class="empty-state">
                        <h3>暂无文档</h3>
                        <p>当前板块暂无文档</p>
                    </div>
                `;
                return;
            }

            // 批量查询创建人用户名
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
                            <th>所属板块</th>
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
                const creatorName = creatorNameMap[item.created_by_uuid] || '未知用户';
                const columnName = '全部板块'; // 匿名用户仅查看all板块

                tableHtml += `
                    <tr onclick="window.location.href='wiki/?id=${item.id}'">
                        <td>${item.id}</td>
                        <td>${item.title || '无标题'}</td>
                        <td>${creatorName}</td>
                        <td>${columnName}</td>
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
            console.error('匿名用户查询文档失败：', error.message);
            tableContainer.innerHTML = `
                <div class="empty-state">
                    <h3>加载失败</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
        return;
    }

    // 账号用户：原有查询逻辑（无修改）
    if (allSections.length === 0) {
        tableContainer.innerHTML = `
            <div class="empty-state">
                <h3>暂无访问权限</h3>
                <p>你没有任何板块的访问权限，请联系管理员</p>
            </div>
        `;
        return;
    }

    try {
        const { data, error } = await Supabase
            .from('document')
            .select('*')
            .or(`column.eq.${currentSection},column.eq.all`)
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
                        <th>所属板块</th>
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
            const creatorName = creatorNameMap[item.created_by_uuid] || '未知用户';
            const columnName = item.column === 'all' ? '全部板块' : item.column;

            tableHtml += `
                <tr onclick="window.location.href='wiki/?id=${item.id}'">
                    <td>${item.id}</td>
                    <td>${item.title || '无标题'}</td>
                    <td>${creatorName}</td>
                    <td>${columnName}</td>
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

// 4. 新建WIKI文档逻辑（无修改，匿名用户已隐藏按钮）
async function initCreateWiki(Supabase) {
    const createBtn = document.getElementById('createWikiBtn');
    const modal = document.getElementById('createModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelCreateBtn');
    const submitBtn = document.getElementById('submitCreateBtn');
    const newTitle = document.getElementById('newTitle');
    const newColumn = document.getElementById('newColumn');
    const newContentType = document.getElementById('newContentType');
    const newContent = document.getElementById('newContent');
    const createError = document.getElementById('createError');

    function fillSectionOptions() {
        newColumn.innerHTML = '';
        currentUser.visit.forEach(section => {
            const option = document.createElement('option');
            option.value = section;
            option.textContent = section;
            newColumn.appendChild(option);
        });
        if (currentUser.admin.length > 0) {
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = '全部板块';
            newColumn.appendChild(allOption);
        }
    }

    createBtn.addEventListener('click', () => {
        modal.classList.add('show');
        newTitle.value = '';
        newContent.value = '';
        createError.style.display = 'none';
        fillSectionOptions();
    });

    const closeModal = () => {
        modal.classList.remove('show');
        createError.style.display = 'none';
    };
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    submitBtn.addEventListener('click', async () => {
        const title = newTitle.value.trim();
        const column = newColumn.value;
        const contentType = parseInt(newContentType.value);
        const content = newContent.value.trim();

        if (!title) {
            createError.textContent = '请输入文档标题';
            createError.style.display = 'block';
            return;
        }
        if (!column) {
            createError.textContent = '请选择所属板块';
            createError.style.display = 'block';
            return;
        }
        if (!content) {
            createError.textContent = '请输入文档内容';
            createError.style.display = 'block';
            return;
        }

        if (column === 'all' && currentUser.admin.length === 0) {
            createError.textContent = '无权限创建全部板块文档';
            createError.style.display = 'block';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '提交中...';
        createError.style.display = 'none';

        try {
            const { data, error } = await Supabase
                .from('document')
                .insert([{
                    title: title,
                    column: column,
                    content_type: contentType,
                    content: content,
                    created_by: currentUser.email,
                    created_by_uuid: currentUser.uuid || 'anonymous',
                    created_at: new Date().toISOString()
                }])
                .select();

            if (error) throw error;

            closeModal();
            await fetchWikiDocuments(Supabase);
            await customAlert('文档创建成功！', '创建成功');

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

// 5. 退出登录逻辑（无修改）
function initLogout(Supabase) {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', async () => {
        const confirmLogout = await customConfirm('确定要退出登录吗？', '退出确认');
        if (!confirmLogout) return;

        if (!currentUser.isAnonymous) {
            await Supabase.auth.signOut().catch(err => console.warn('退出auth失败：', err));
        }

        document.cookie = 'apiKey=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'supabaseUserId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'supabaseEmail=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'isAnonymous=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        
        window.location.href = 'login/';
    });
}

// 6. 页面初始化入口（无修改）
document.addEventListener('DOMContentLoaded', async function() {
    await import('./modal-utils.js').catch(() => {
        console.warn('模态框工具加载失败，使用原生提示框');
    });

    const Supabase = await initSupabase();
    if (!Supabase) return;

    await renderSectionTabs(Supabase);
    await fetchWikiDocuments(Supabase);

    initCreateWiki(Supabase);
    initLogout(Supabase);
});