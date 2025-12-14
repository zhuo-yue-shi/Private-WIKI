// 1. 全局常量与状态（与主登录页保持一致的加密API Key）
const encryptedApiKey = "g5FnrejkYuEg/Q4d9elguW6Pwz3QrvZP+xoNbZIINyCXoD7aofa4dMeZy88rs+xeHVzX4exRDZJVa8zeubZO9anOMGiKkra/YgO2K4+AM6wRHm0Q6Y0Xl/jVhjoYBFC61EZ7ukBsVgS1BVAAuWrG55h3tukHrHtamF+tAWkcM0sGLaE4owRrAmA/VXcrm5v01WXyw2vIDTu6GqErZ17jQj9oOpQWKuxaOJ21nU3FuFVKmVUIiFZuO3PJA5OJSiZrXOgO/SY3SJHYq7Finj7e+Bf0ozwO2MPm8PFzMjDRYMK9ooqhlgk2fKezG+HvX7IcqNoJFlrUwlkmkmyE";
const SUPABASE_URL = "https://lveyzrryikhijvnrxhlo.supabase.co";
let decryptedApiKey = null; // 存储解密后的API Key（全局复用）

// 2. DOM元素（分阶段获取对应区域元素）
let apiDecryptInput, apiDecryptBtn, apiDecryptError, apiDecryptSection;
let accountLoginSection, emailInput, passwordInput, accountLoginBtn, accountLoginError;

// 3. Cookie工具函数（复用）
function setCookie(name, value, days = 7) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax`;
}

// 4. 错误提示工具（区分解密错误和登录错误）
function showError(element, msg) {
    if (!element) return;
    element.textContent = msg;
    element.style.display = "block";
    setTimeout(() => {
        element.style.display = "none";
    }, 5000);
}

// 5. 第一阶段：API Key解密验证逻辑
async function handleApiDecrypt() {
    const decryptPassword = apiDecryptInput.value.trim();
    if (!decryptPassword) {
        return showError(apiDecryptError, "请输入API解密密码");
    }

    // 禁用按钮防止重复提交
    apiDecryptBtn.disabled = true;
    apiDecryptBtn.textContent = "验证中...";
    apiDecryptError.style.display = "none";

    try {
        // 调用tools-key.js中的解密函数（与主登录页一致）
        decryptedApiKey = await aes256gcmDecrypt(encryptedApiKey, decryptPassword);
        if (!decryptedApiKey) throw new Error("解密失败，未获取到有效API Key");

        // 解密成功：隐藏解密区，显示账号登录区
        apiDecryptSection.style.display = "none";
        accountLoginSection.style.display = "block";
        // 自动聚焦到邮箱输入框（优化体验）
        emailInput.focus();

    } catch (error) {
        console.error("API解密失败：", error);
        showError(apiDecryptError, "解密密码错误，请重新输入");
    } finally {
        // 恢复按钮状态
        apiDecryptBtn.disabled = false;
        apiDecryptBtn.textContent = "验证解密密码";
    }
}

// 6. 第二阶段：Supabase初始化（依赖解密后的API Key）
async function initSupabase() {
    return new Promise((resolve, reject) => {
        // 超时保护（5秒）
        const timeoutTimer = setTimeout(() => {
            reject(new Error("Supabase加载超时，请检查网络"));
        }, 20000);

        // 检查Supabase CDN是否加载完成
        const checkInterval = setInterval(() => {
            if (supabase.createClient && decryptedApiKey) {
                clearInterval(checkInterval);
                clearTimeout(timeoutTimer);
                try {
                    const Supabase = supabase.createClient(SUPABASE_URL, decryptedApiKey);
                    resolve(Supabase);
                } catch (initErr) {
                    reject(new Error(`Supabase初始化失败：${initErr.message}`));
                }
            }
        }, 100);
    });
}

// 7. 第二阶段：账号登录输入验证
function validateAccountInput(email, pwd) {
    if (!email) {
        showError(accountLoginError, "请输入邮箱");
        return false;
    }
    const emailReg = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailReg.test(email)) {
        showError(accountLoginError, "请输入有效的邮箱（如：xxx@example.com）");
        return false;
    }
    if (!pwd) {
        showError(accountLoginError, "请输入账号密码");
        return false;
    }
    if (pwd.length < 6) {
        showError(accountLoginError, "账号密码不能少于6位");
        return false;
    }
    return true;
}

// 8. 第二阶段：核心账号登录逻辑
async function handleAccountLogin() {
    const email = emailInput.value.trim();
    const pwd = passwordInput.value.trim();

    // 输入验证
    if (!validateAccountInput(email, pwd)) return;

    // 禁用按钮防止重复提交
    accountLoginBtn.disabled = true;
    accountLoginBtn.textContent = "登录中...";
    accountLoginError.style.display = "none";

    try {
        // 初始化Supabase（依赖解密后的API Key）
        const Supabase = await initSupabase();
        if (!Supabase) throw new Error("Supabase客户端初始化失败");

        // 调用Supabase账号登录接口
        const { data, error } = await Supabase.auth.signInWithPassword({
            email: email,
            password: pwd
        });

        if (error) throw error;

        // 登录成功：存储用户信息+跳转主页
        setCookie("supabaseUserId", data.user.id, 7);
        setCookie("supabaseEmail", data.user.email, 7);
        setCookie("apiKey", decryptedApiKey, 7); 
        setCookie('isAnonymous', 'false'); // 新增：标记为非匿名登录

        window.location.href = "../../";

    } catch (err) {
        // 精准错误提示
        let errMsg = "登录失败，请重试";
        switch (err.code) {
            case "INVALID_CREDENTIALS":
                errMsg = "邮箱或账号密码错误";
                break;
            case "EMAIL_NOT_FOUND":
                errMsg = "该邮箱未注册账号";
                break;
            case "TOO_MANY_REQUESTS":
                errMsg = "登录请求过频繁，请10分钟后再试";
                break;
            default:
                errMsg = err.message || errMsg;
        }
        showError(accountLoginError, errMsg);
        console.error("账号登录错误：", err);
    } finally {
        // 恢复按钮状态
        accountLoginBtn.disabled = false;
        accountLoginBtn.textContent = "账号登录";
    }
}

// 9. 页面加载完成：初始化元素与绑定事件
document.addEventListener("DOMContentLoaded", () => {
    // 初始化第一阶段元素（API解密区）
    apiDecryptInput = document.getElementById("apiDecryptInput");
    apiDecryptBtn = document.getElementById("apiDecryptBtn");
    apiDecryptError = document.getElementById("apiDecryptError");
    apiDecryptSection = document.getElementById("apiDecryptSection");

    // 初始化第二阶段元素（账号登录区）
    accountLoginSection = document.getElementById("accountLoginSection");
    emailInput = document.getElementById("emailInput");
    passwordInput = document.getElementById("passwordInput");
    accountLoginBtn = document.getElementById("accountLoginBtn");
    accountLoginError = document.getElementById("accountLoginError");

    // 第一阶段事件绑定：解密按钮+回车键
    apiDecryptBtn.addEventListener("click", handleApiDecrypt);
    apiDecryptInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleApiDecrypt();
    });

    // 第二阶段事件绑定：账号登录按钮+回车键
    accountLoginBtn.addEventListener("click", handleAccountLogin);
    [emailInput, passwordInput].forEach(input => {
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") handleAccountLogin();
        });
    });

    // 检查已登录状态（若已登录直接跳转）
    checkLoginState();
});

// 10. 检查已登录状态（避免重复登录）
async function checkLoginState() {
    try {
        if (!decryptedApiKey) return; // 未解密完成则不检查
        const Supabase = await initSupabase();
        const { data: { user } } = await Supabase.auth.getUser();
        if (user) window.location.href = "../../";
    } catch (err) {
        console.error("检查登录状态错误：", err);
    }
}