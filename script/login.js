const encryptedApiKey = "g5FnrejkYuEg/Q4d9elguW6Pwz3QrvZP+xoNbZIINyCXoD7aofa4dMeZy88rs+xeHVzX4exRDZJVa8zeubZO9anOMGiKkra/YgO2K4+AM6wRHm0Q6Y0Xl/jVhjoYBFC61EZ7ukBsVgS1BVAAuWrG55h3tukHrHtamF+tAWkcM0sGLaE4owRrAmA/VXcrm5v01WXyw2vIDTu6GqErZ17jQj9oOpQWKuxaOJ21nU3FuFVKmVUIiFZuO3PJA5OJSiZrXOgO/SY3SJHYq7Finj7e+Bf0ozwO2MPm8PFzMjDRYMK9ooqhlgk2fKezG+HvX7IcqNoJFlrUwlkmkmyE";

// 新增：匿名登录标识Cookie（区分匿名/账号登录）
function setCookie(name, value, days = 7) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax`;
}

document.getElementById('loginBtn').addEventListener('click', async function () {
    const password = document.getElementById('passwordInput').value;
    const errorMessage = document.getElementById('errorMessage');

    if (!password) {
        errorMessage.textContent = '请输入密码';
        errorMessage.style.display = 'block';
        return;
    }

    try {
        const decryptedApiKey = await aes256gcmDecrypt(encryptedApiKey, password);
        console.log('解密后的API密钥:', decryptedApiKey);
        
        // 存储API密钥 + 标记为匿名登录
        setCookie('apiKey', decryptedApiKey);
        setCookie('isAnonymous', 'true'); // 新增：匿名登录标识

        errorMessage.textContent = '登录成功！正在跳转...';
        errorMessage.style.color = 'green';
        errorMessage.style.display = 'block';

        setTimeout(() => {
            window.location.href = '../';
        }, 1000);

    } catch (error) {
        errorMessage.textContent = '密码错误';
        errorMessage.style.color = 'red';
        errorMessage.style.display = 'block';
        console.error('解密失败:', error.message);
    }
});

document.getElementById('passwordInput').addEventListener('keypress', function (event) {
    if (event.key === 'Enter') {
        document.getElementById('loginBtn').click();
    }
});