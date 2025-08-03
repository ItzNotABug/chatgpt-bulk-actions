// =========================
// Utility Functions
// =========================
function waitForElement(selector, callback) {
    const tryFind = () => document.querySelector(selector);
    let el = tryFind();
    if (el) return void callback(el);

    const observer = new MutationObserver((_, obs) => {
        el = tryFind();
        if (el) {
            obs.disconnect();
            callback(el);
        }
    });
    observer.observe(document.body, {childList: true, subtree: true});
}

function observeSidebarMount() {
    const observer = new MutationObserver(() => {
        const sidebar = document.querySelector('#history');
        const h2 = sidebar?.querySelector('aside h2');
        const alreadyInjected = sidebar?.querySelector('.bulk-menu-btn');
        if (sidebar && h2 && !alreadyInjected) {
            createBulkActionsUI();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function extractFirstJwtFromScripts() {
    const jwtRegex = /\b([A-Za-z0-9-_]{10,})\.([A-Za-z0-9-_]{10,})\.([A-Za-z0-9-_]{10,})\b/;
    const scripts = Array.from(document.querySelectorAll('script[nonce]'));

    for (const script of scripts) {
        const text = script.textContent;
        if (!text) continue;
        const match = text.match(jwtRegex);
        if (match) return `${match[1]}.${match[2]}.${match[3]}`;
    }
    return null;
}

function notifyUpdateResult(successCount, isArchive) {
    const failed = selectedConversations.size - successCount;
    const notify = (message) => chrome.runtime.sendMessage({type: 'show-notification', message});

    if (successCount > 0) {
        const action = isArchive ? 'archived' : 'deleted';
        const plural = successCount === 1 ? '' : 's';
        notify(`${successCount} conversation${plural} ${action} successfully.`);
    }

    if (failed > 0) {
        const plural = failed === 1 ? '' : 's';
        notify(`${failed} conversation${plural} failed to update.`);
    }
}

// =========================
// Selection Mode State
// =========================
let isSelectionMode = false;
let selectedConversations = new Set();

// =========================
// UI Injection
// =========================
function injectStyles() {
    if (document.getElementById('bulk-actions-style')) return;
    const style = document.createElement('style');
    style.id = 'bulk-actions-style';
    style.textContent = `
        .bulk-menu-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                border: none;
                background: transparent;
                cursor: pointer;
                transition: all 0.15s ease;
                color: #8e8ea0;
                position: relative;
            }
            
            .bulk-menu-btn:hover {
                background: rgba(255, 255, 255, 0.08);
                color: #ffffff;
            }
            
            .bulk-menu-btn svg {
                width: 14px;
                height: 14px;
                transition: all 0.2s ease;
            }
            
            .bulk-menu-btn .dots-icon,
            .bulk-menu-btn .x-icon {
                position: absolute;
                transition: all 0.2s ease;
            }
            
            .bulk-menu-btn .x-icon {
                opacity: 0;
                transform: rotate(-90deg);
            }
            
            .bulk-menu-btn.selection-mode-active .dots-icon {
                opacity: 0;
                transform: rotate(90deg);
            }
            
            .bulk-menu-btn.selection-mode-active .x-icon {
                opacity: 1;
                transform: rotate(0deg);
            }
            
            .selection-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-right: 6px;
                opacity: 0;
                transform: translateX(8px);
                transition: all 0.25s ease;
            }
            
            .selection-actions.show {
                opacity: 1;
                transform: translateX(0);
            }
            
            .action-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                border: none;
                cursor: pointer;
                transition: all 0.15s ease;
                font-size: 11px;
            }
            
            .action-btn.select-all {
                color: #9ca3af;
                background: transparent;
            }
            
            .action-btn.select-all:hover {
                color: #ffffff;
                transform: scale(1.05);
                background: rgba(255, 255, 255, 0.12);
            }
            
            .action-btn.delete {
                color: #ef4444;
            }
            
            .action-btn.delete:hover:not(:disabled) {
                transform: scale(1.05);
                color: rgba(239, 67, 67, 0.75);
                background: rgba(239, 68, 68, 0.2);
            }
            
            .action-btn.delete:disabled {
                opacity: 0.3;
                color: #6b7280;
                cursor: not-allowed;
            }
            
            .action-btn.archive {
                color: #3B82F6;
            }
            
            .action-btn.archive:hover:not(:disabled) {
                transform: scale(1.05);
                color: rgba(60, 131, 246, 0.75);
                background: rgba(59, 130, 246, 0.2);
            }
            
            .action-btn.archive:disabled {
                opacity: 0.3;
                color: #6b7280;
                cursor: not-allowed;
            }
            
            .action-btn svg {
                width: 14px;
                height: 14px;
            }
            
            .conversation-checkbox {
                appearance: none;
                width: 18px;
                height: 18px;
                border: 1.5px solid #565869;
                border-radius: 3px;
                background: transparent;
                cursor: pointer;
                margin-right: 8px;
                position: relative;
                transition: all 0.15s ease;
                flex-shrink: 0;
                outline: none;
            }
            
            .conversation-checkbox:focus {
                outline: none;
                box-shadow: none;
            }
            
            .conversation-checkbox:checked {
                background: unset;
                border-color: #565869;
            }
            
            .conversation-checkbox:checked::after {
                content: '';
                position: absolute;
                left: 5.5px;
                top: 2.5px;
                width: 4px;
                height: 8px;
                border: 0.5px solid rgba(255, 255, 255, 0.75);
                border-width: 0 2px 2px 0;
                transform: rotate(45deg);
            }
            
            .conversation-checkbox:hover {
                border-color: #6b7280;
            }
            
            .conversation-item {
                transition: all 0.15s ease;
            }
            
            .conversation-item.selected {
                background: transparent;
            }
            
            .selection-count {
                font-size: 12px;
                color: #9ca3af;
                margin-right: 8px;
                min-width: 16px;
                opacity: 0;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                height: 24px;
                background: rgba(255, 255, 255, 0.05);
                padding: 0 6px;
                border-radius: 10px;
                font-weight: 500;
            }
            
            .selection-count.show {
                opacity: 1;
                transform: scale(1);
            }
    `;
    document.head.appendChild(style);
}

function createBulkActionsUI() {
    const aside = document.querySelector('#history aside');
    const h2 = aside?.querySelector('h2');
    if (!aside || !h2) return;

    if (aside.querySelector('#headerWrapper')) return;

    let headerWrapper = h2.parentElement;
    if (!headerWrapper.classList.contains('flex')) {
        headerWrapper = document.createElement('div');
        headerWrapper.id = "headerWrapper";
        headerWrapper.className = 'flex items-center justify-between';
        h2.parentElement.insertBefore(headerWrapper, h2);
        headerWrapper.appendChild(h2);
    }

    const actionContainer = document.createElement('div');
    actionContainer.className = 'flex items-center';

    const selectionCount = document.createElement('span');
    selectionCount.className = 'selection-count';
    selectionCount.textContent = '0';

    const selectionActions = document.createElement('div');
    selectionActions.className = 'selection-actions';
    selectionActions.innerHTML = `
        <button class="action-btn select-all" title="Select All">
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 448 512">
                <path d="M342.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 178.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l80 80c12.5 12.5 32.8 12.5 45.3 0l160-160zm96 128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 402.7 54.6 297.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l256-256z"/>
            </svg>
        </button>
        <button class="action-btn archive" title="Archive Selected" disabled>
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 512 512">
                <path d="M32 32l448 0c17.7 0 32 14.3 32 32l0 32c0 17.7-14.3 32-32 32L32 128C14.3 128 0 113.7 0 96L0 64C0 46.3 14.3 32 32 32zm0 128l448 0 0 256c0 35.3-28.7 64-64 64L96 480c-35.3 0-64-28.7-64-64l0-256zm128 80c0 8.8 7.2 16 16 16l160 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-160 0c-8.8 0-16 7.2-16 16z"/>
            </svg>
        </button>
        <button class="action-btn delete" title="Delete Selected" disabled>
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 448 512">
                <path d="M135.2 17.7L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-7.2-14.3C307.4 6.8 296.3 0 284.2 0L163.8 0c-12.1 0-23.2 6.8-28.6 17.7zM416 128L32 128 53.2 467c1.6 25.3 22.6 45 47.9 45l245.8 0c25.3 0 46.3-19.7 47.9-45L416 128z"/>
            </svg>
        </button>
    `;

    const menuButton = document.createElement('button');
    menuButton.title = 'Bulk actions';
    menuButton.className = 'bulk-menu-btn';
    menuButton.style.marginInlineEnd = '1rem';
    menuButton.innerHTML = `
        <svg class="dots-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 128 512">
            <path d="M64 360a56 56 0 1 0 0 112 56 56 0 1 0 0-112zm0-160a56 56 0 1 0 0 112 56 56 0 1 0 0-112zM120 96A56 56 0 1 0 8 96a56 56 0 1 0 112 0z"/>
        </svg>
        
        <svg class="x-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 384 512">
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
        </svg>
    `;

    actionContainer.appendChild(selectionCount);
    actionContainer.appendChild(selectionActions);
    actionContainer.appendChild(menuButton);
    headerWrapper.appendChild(actionContainer);

    menuButton.addEventListener('click', toggleSelectionMode);
    selectionActions.querySelector('.select-all').addEventListener('click', toggleSelectAll);
    selectionActions.querySelector('.archive').addEventListener('click', archiveSelected);
    selectionActions.querySelector('.delete').addEventListener('click', deleteSelected);
}

// =========================
// Interaction Handlers
// =========================
function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    selectedConversations.clear();
    const menuBtn = document.querySelector('.bulk-menu-btn');
    const actions = document.querySelector('.selection-actions');
    const countEl = document.querySelector('.selection-count');

    const trailingButtons = document.querySelectorAll('.trailing.highlight');

    if (isSelectionMode) {
        menuBtn.classList.add('selection-mode-active');
        actions.classList.add('show');
        addCheckboxesToConversations();
        trailingButtons.forEach(btn => {
            btn.dataset.originalDisplay = btn.style.display || '';
            btn.style.display = 'none';
        });
    } else {
        menuBtn.classList.remove('selection-mode-active');
        actions.classList.remove('show');
        countEl.classList.remove('show');
        removeCheckboxesFromConversations();
        trailingButtons.forEach(btn => {
            btn.style.display = btn.dataset.originalDisplay || '';
            delete btn.dataset.originalDisplay;
        });
    }
}

function handleCheckboxChange() {
    const convoId = this.dataset.convoId;
    const item = this.closest('.conversation-item');
    this.checked ? selectedConversations.add(convoId) : selectedConversations.delete(convoId);
    item.classList.toggle('selected', this.checked);
    updateSelectionUI();
}

function updateSelectionUI() {
    const archiveBtn = document.querySelector('.action-btn.archive');
    const deleteBtn = document.querySelector('.action-btn.delete');
    const selectAllBtn = document.querySelector('.action-btn.select-all');
    const countEl = document.querySelector('.selection-count');
    const count = selectedConversations.size;
    const total = document.querySelectorAll('.conversation-checkbox').length;
    const allSelected = count === total && count > 0;

    archiveBtn.disabled = deleteBtn.disabled = count === 0;
    selectAllBtn.title = allSelected ? 'Deselect All' : 'Select All';
    countEl.textContent = count.toString();
    countEl.classList.toggle('show', count > 0);
}

function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.conversation-checkbox');
    const allSelected = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => {
        cb.checked = !allSelected;
        handleCheckboxChange.call(cb);
    });
}

function resetSelectionStatus() {
    document.querySelector('.bulk-menu-btn')?.classList.remove('selection-mode-active');
    document.querySelector('.selection-actions')?.classList.remove('show');
    document.querySelector('.selection-count')?.classList.remove('show');
    removeCheckboxesFromConversations();
}

// =========================
// DOM Injection Logic
// =========================
function addCheckboxesToConversations() {
    document.querySelectorAll('#history a[href^="/c/"]').forEach(link => {
        const convoId = link.getAttribute('href').match(/\/c\/(.+)/)?.[1];
        if (!convoId) return;

        const content = link.querySelector('div.flex.min-w-0.grow.items-center.gap-2\\.5');
        if (!content || content.querySelector('.conversation-checkbox')) return;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'conversation-checkbox';
        checkbox.dataset.convoId = convoId;
        checkbox.addEventListener('click', (e) => e.stopPropagation());
        checkbox.addEventListener('change', handleCheckboxChange);
        content.insertBefore(checkbox, content.firstChild);

        link.classList.add('conversation-item');
        link.addEventListener('click', onSelectableClick);
    });
}

function removeCheckboxesFromConversations() {
    document.querySelectorAll('.conversation-item').forEach(link => {
        const cb = link.querySelector('.conversation-checkbox');
        if (cb) cb.remove();
        link.removeEventListener('click', onSelectableClick);
        link.classList.remove('conversation-item');
    });
}

function onSelectableClick(e) {
    if (!isSelectionMode) return;
    e.preventDefault();
    const cb = this.querySelector('.conversation-checkbox');
    if (cb) {
        cb.checked = !cb.checked;
        handleCheckboxChange.call(cb);
    }
}


// =========================
// Conversation Actions
// =========================
async function removeConversations(mode) {
    const isArchive = mode === 'archive';
    const payload = isArchive ? {is_archived: true} : {is_visible: false};
    const token = extractFirstJwtFromScripts();
    if (!token) return alert('Could not extract session token.');

    let successCount = 0;

    await Promise.all(Array.from(selectedConversations).map(async (convoId) => {
        const checkbox = document.querySelector(`[data-convo-id="${convoId}"]`);
        const item = checkbox?.closest('.conversation-item');
        if (!item) return;

        try {
            const res = await fetch(`/backend-api/conversation/${convoId}`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const {success} = await res.json();
            if (!success) return;

            successCount++;
            if (item.isConnected) {
                item.remove();
            } else if (item.parentNode) {
                item.parentNode.removeChild(item);
            }
        } catch (error) {
            console.error(error);
        }
    }));

    notifyUpdateResult(successCount, isArchive);
    selectedConversations.clear();
}

function deleteSelected() {
    const count = selectedConversations.size;
    if (count && confirm(`Delete ${count} conversation${count > 1 ? 's' : ''}?`)) {
        removeConversations('delete').then(() => {
            updateSelectionUI();
            resetSelectionStatus();
        });
    }
}

function archiveSelected() {
    const count = selectedConversations.size;
    if (count && confirm(`Archive ${count} conversation${count > 1 ? 's' : ''}?`)) {
        removeConversations('archive').then(() => {
            updateSelectionUI();
            resetSelectionStatus();
        });
    }
}

// =========================
// Init
// =========================
window.addEventListener('load', () => {
    injectStyles();
    waitForElement('#history aside h2', createBulkActionsUI);
    observeSidebarMount();
});

window.addEventListener('resize', () => createBulkActionsUI);
