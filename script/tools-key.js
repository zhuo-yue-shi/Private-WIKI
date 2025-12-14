/**
 * AES-256-GCM 加密工具
 * @param {string} plaintext 明文（字符串）
 * @param {string} password 加密密码（用户输入）
 * @returns {Promise<string>} 加密结果（base64编码：盐+IV+标签+密文）
 */
async function aes256gcmEncrypt(plaintext, password) {
  // 1. 生成随机盐（16字节，用于密钥派生）
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  // 2. 生成随机IV（12字节，GCM推荐长度）
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // 3. 从密码派生256位密钥（PBKDF2，迭代次数10万+）
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000, // 迭代次数越高越安全，根据性能调整
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 }, // 256位AES
    false,
    ['encrypt', 'decrypt']
  );

  // 4. AES-256-GCM加密（生成认证标签）
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  // 5. 拼接盐、IV、标签、密文（标签在加密结果的最后16字节）
  const encryptedArray = new Uint8Array(encrypted);
  const tag = encryptedArray.slice(-16); // GCM标签固定16字节
  const ciphertext = encryptedArray.slice(0, -16);

  // 6. 合并为一个数组并转base64（便于传输/存储）
  const combined = new Uint8Array([
    ...salt,
    ...iv,
    ...tag,
    ...ciphertext
  ]);
  return btoa(String.fromCharCode(...combined));
}

/**
 * AES-256-GCM 解密工具
 * @param {string} encryptedBase64 加密后的base64字符串
 * @param {string} password 解密密码
 * @returns {Promise<string>} 解密后的明文
 */
async function aes256gcmDecrypt(encryptedBase64, password) {
  try {
    // 1. 解析base64为字节数组
    const combined = new Uint8Array(
      atob(encryptedBase64).split('').map(char => char.charCodeAt(0))
    );

    // 2. 拆分盐、IV、标签、密文
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28); // 16+12=28
    const tag = combined.slice(28, 44); // 28+16=44
    const ciphertext = combined.slice(44);

    // 3. 派生密钥（和加密时参数一致）
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    const key = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // 4. 合并密文和标签（解密需要完整的加密结果）
    const encrypted = new Uint8Array([...ciphertext, ...tag]);

    // 5. 解密（自动验证标签，篡改会抛出错误）
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // 密码错误/密文篡改/参数错误都会触发异常
    throw new Error('解密失败：密码错误或密文被篡改');
  }
}

// // 用法示例
// (async () => {
//   const plaintext = '这是需要加密的敏感数据123456';
//   const password = 'MyStrongPassword123!@#'; // 建议用户密码包含大小写、数字、特殊字符

//   // 加密
//   const encrypted = await aes256gcmEncrypt(plaintext, password);
//   console.log('加密结果：', encrypted);

//   // 解密
//   const decrypted = await aes256gcmDecrypt(encrypted, password);
//   console.log('解密结果：', decrypted); // 输出原明文
// })();