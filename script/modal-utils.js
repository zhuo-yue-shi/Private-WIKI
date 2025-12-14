/**
 * 自定义Alert弹窗
 * @param {string} message 提示内容
 * @param {string} title 标题（默认：提示）
 * @returns {Promise<void>}
 */
function customAlert(message, title = '提示') {
    return new Promise((resolve) => {
        // 创建弹窗DOM
        const mask = document.createElement('div');
        mask.className = 'custom-modal-mask';
        mask.innerHTML = `
            <div class="custom-modal-content">
                <div class="custom-modal-header">${title}</div>
                <div class="custom-modal-body">${message}</div>
                <div class="custom-modal-footer">
                    <button class="custom-modal-btn modal-confirm-btn" id="modalOkBtn">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(mask);

        // 显示弹窗
        setTimeout(() => mask.classList.add('show'), 10);

        // 绑定确定按钮事件
        const okBtn = mask.querySelector('#modalOkBtn');
        okBtn.addEventListener('click', () => {
            mask.classList.remove('show');
            setTimeout(() => document.body.removeChild(mask), 200);
            resolve();
        });

        // 点击遮罩关闭
        mask.addEventListener('click', (e) => {
            if (e.target === mask) {
                mask.classList.remove('show');
                setTimeout(() => document.body.removeChild(mask), 200);
                resolve();
            }
        });
    });
}

/**
 * 自定义Confirm弹窗
 * @param {string} message 提示内容
 * @param {string} title 标题（默认：确认）
 * @returns {Promise<boolean>} true=确认，false=取消
 */
function customConfirm(message, title = '确认') {
    return new Promise((resolve) => {
        // 创建弹窗DOM
        const mask = document.createElement('div');
        mask.className = 'custom-modal-mask';
        mask.innerHTML = `
            <div class="custom-modal-content">
                <div class="custom-modal-header">${title}</div>
                <div class="custom-modal-body">${message}</div>
                <div class="custom-modal-footer">
                    <button class="custom-modal-btn modal-cancel-btn" id="modalCancelBtn">取消</button>
                    <button class="custom-modal-btn modal-confirm-btn" id="modalConfirmBtn">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(mask);

        // 显示弹窗
        setTimeout(() => mask.classList.add('show'), 10);

        // 绑定取消按钮事件
        const cancelBtn = mask.querySelector('#modalCancelBtn');
        cancelBtn.addEventListener('click', () => {
            mask.classList.remove('show');
            setTimeout(() => document.body.removeChild(mask), 200);
            resolve(false);
        });

        // 绑定确定按钮事件
        const confirmBtn = mask.querySelector('#modalConfirmBtn');
        confirmBtn.addEventListener('click', () => {
            mask.classList.remove('show');
            setTimeout(() => document.body.removeChild(mask), 200);
            resolve(true);
        });

        // 点击遮罩关闭（返回取消）
        mask.addEventListener('click', (e) => {
            if (e.target === mask) {
                mask.classList.remove('show');
                setTimeout(() => document.body.removeChild(mask), 200);
                resolve(false);
            }
        });
    });
}

// 覆盖原生alert/confirm（可选，方便全局替换）
window.alert = customAlert;
window.confirm = customConfirm;