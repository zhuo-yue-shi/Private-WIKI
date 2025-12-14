// 获取Cookie工具函数
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

// 获取URL参数
function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

// 全局变量
let Supabase = null;
const userIdParam = getUrlParam('id');

// 初始化Supabase
async function initSupabase() {
    const apiKey = getCookie('apiKey');
    if (!apiKey) {
        throw new Error('未获取到API Key，请先登录');
    }

    // 等待Supabase加载
    await new Promise(resolve => {
        const checkSupabase = setInterval(() => {
            if (window.supabase && supabase.createClient) {
                clearInterval(checkSupabase);
                resolve();
            }
        }, 50);
    });

    const supabaseUrl = 'https://lveyzrryikhijvnrxhlo.supabase.co';
    return supabase.createClient(supabaseUrl, apiKey);
}

// 渲染用户信息
function renderUserInfo(userInfo) {
    // 隐藏加载，显示卡片
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('userCard').classList.remove('hidden');

    // 基础信息
    document.getElementById('userId').textContent = userInfo.id || '无';
    document.getElementById('userName').textContent = userInfo.username || '未知用户';

    // 性别处理（1：男生，2：女生，3：未知）
    const genderEl = document.getElementById('userGender');
    switch (userInfo.gender) {
        case 1:
            genderEl.textContent = '男生';
            genderEl.className = 'gender-tag gender-male';
            break;
        case 2:
            genderEl.textContent = '女生';
            genderEl.className = 'gender-tag gender-female';
            break;
        default:
            genderEl.textContent = '未知';
            genderEl.className = 'gender-tag gender-unknown';
            break;
    }

    // 可访问板块
    const visitEl = document.getElementById('userVisit');
    visitEl.innerHTML = '';
    if (userInfo.visit && userInfo.visit.length > 0) {
        userInfo.visit.forEach(section => {
            visitEl.innerHTML += `<span class="tag">${section}</span>`;
        });
    } else {
        visitEl.innerHTML = '<span class="tag" style="background-color:#f5f5f5;color:#666;">无</span>';
    }

    // 管理员权限（仅显示与visit的交集）
    const adminEl = document.getElementById('userAdmin');
    adminEl.innerHTML = '';
    const adminIntersection = userInfo.admin 
        ? userInfo.admin.filter(item => userInfo.visit?.includes(item)) 
        : [];
    
    if (adminIntersection.length > 0) {
        adminIntersection.forEach(section => {
            adminEl.innerHTML += `<span class="tag">${section}</span>`;
        });
    } else {
        adminEl.innerHTML = '<span class="tag" style="background-color:#f5f5f5;color:#666;">无</span>';
    }
}

// 显示错误信息
function showError(message) {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('errorState').classList.remove('hidden');
    document.getElementById('errorMsg').textContent = message;
}

// 加载用户信息
async function loadUserInfo() {
    // 校验参数
    if (!userIdParam) {
        showError('缺少用户ID参数');
        return;
    }

    try {
        // 初始化Supabase
        Supabase = await initSupabase();

        // 查询用户信息
        const { data, error } = await Supabase
            .from('users')
            .select('*')
            .eq('id', userIdParam)
            .single();

        if (error) throw error;
        if (!data) throw new Error('未找到该用户信息');

        // 渲染信息
        renderUserInfo(data);

    } catch (err) {
        console.error('加载用户信息失败：', err);
        showError(err.message || '加载用户信息失败');
    }
}

// 页面加载执行
document.addEventListener('DOMContentLoaded', loadUserInfo);