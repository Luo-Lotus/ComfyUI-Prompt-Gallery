import { h } from '../lib/preact.mjs';
import { useState, useEffect, useCallback } from '../lib/hooks.mjs';
import { Dialog } from './Dialog.js';
import { Icon } from '../lib/icons.mjs';
import { showToast } from './Toast.js';
import { useGallery } from './GalleryContext.js';
import { Storage } from '../utils.js';

const MENU_ITEMS = [
  { key: 'gallery', label: '图库设置', icon: 'image' },
  { key: 'storage', label: '存储管理', icon: 'folder' },
  { key: 'faq', label: '常见问题', icon: 'info-circle' },
];

const TYPE_LABELS = {
  prompts: 'Prompts',
  categories: '分类',
  combinations: '组合',
  images: '图片映射',
};

// ───────── 图库设置面板 ─────────

function GallerySettings() {
  const ctx = useGallery();
  const mode = ctx.cardLayoutMode;

  const handleModeChange = useCallback((newMode) => {
    ctx.setCardLayoutMode(newMode);
    Storage.saveCardLayoutMode(newMode);
  }, [ctx.setCardLayoutMode]);

  return h('div', { class: 'settings-panel' }, [
    h('div', { class: 'settings-section-title' }, '图库设置'),
    h('div', { class: 'settings-option-row' }, [
      h('div', { class: 'settings-option-label' }, '卡片展示方式'),
      h('div', { class: 'settings-option-desc' }, '选择图库中卡片的展示方式'),
    ]),
    h('div', { class: 'settings-radio-group' }, [
      h('button', {
        class: 'settings-radio-btn' + (mode === 'fixed' ? ' active' : ''),
        onClick: () => handleModeChange('fixed'),
      }, [
        h(Icon, { name: 'grid', size: 14 }),
        '固定大小',
      ]),
      h('button', {
        class: 'settings-radio-btn' + (mode === 'adaptive' ? ' active' : ''),
        onClick: () => handleModeChange('adaptive'),
      }, [
        h(Icon, { name: 'image', size: 14 }),
        '自适应',
      ]),
    ]),
  ]);
}

// ───────── 存储管理面板 ─────────

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatBackupName(name) {
  const m = name.match(/backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return name;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
}

function StorageSettings() {
  const [files, setFiles] = useState([]);
  const [backups, setBackups] = useState([]);
  const [maxBackups, setMaxBackups] = useState(3);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [filesRes, backupsRes] = await Promise.all([
        fetch('/prompt_gallery/settings/storage_files').then(r => r.json()),
        fetch('/prompt_gallery/settings/backups').then(r => r.json()),
      ]);
      if (filesRes.success) setFiles(filesRes.files);
      if (backupsRes.success) {
        setBackups(backupsRes.backups);
        if (backupsRes.maxBackups != null) setMaxBackups(backupsRes.maxBackups);
      }
    } catch (e) {
      showToast('加载存储信息失败', 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = useCallback(async (filename) => {
    try {
      const res = await fetch('/prompt_gallery/settings/storage_files/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      }).then(r => r.json());
      if (res.success) {
        showToast(res.disabled ? '已禁用' : '已启用', 'success');
        loadData();
      } else {
        showToast(res.error || '操作失败', 'error');
      }
    } catch (e) {
      showToast('操作失败', 'error');
    }
  }, [loadData]);

  const handleApplyBackup = useCallback(async (name) => {
    if (!confirm(`确定要应用备份 ${formatBackupName(name)} 吗？\n当前数据会先自动备份。`)) return;
    try {
      const res = await fetch(`/prompt_gallery/settings/backups/${name}/apply`, {
        method: 'POST',
      }).then(r => r.json());
      if (res.success) {
        showToast('备份已应用' + (res.safety_backup ? `（安全备份: ${formatBackupName(res.safety_backup)}）` : ''), 'success');
        loadData();
      } else {
        showToast(res.error || '应用失败', 'error');
      }
    } catch (e) {
      showToast('应用备份失败', 'error');
    }
  }, [loadData]);

  const handleCreateBackup = useCallback(async () => {
    try {
      const res = await fetch('/prompt_gallery/settings/backups/create', {
        method: 'POST',
      }).then(r => r.json());
      if (res.success) {
        showToast(res.backup ? '备份已创建' : '无文件可备份', res.backup ? 'success' : 'info');
        loadData();
      } else {
        showToast(res.error || '备份失败', 'error');
      }
    } catch (e) {
      showToast('备份失败', 'error');
    }
  }, [loadData]);

  const handleMaxBackupsChange = useCallback(async (value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) return;
    setMaxBackups(num);
    try {
      await fetch('/prompt_gallery/settings/max_backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: num }),
      });
    } catch (e) {
      // ignore
    }
  }, []);

  if (loading) {
    return h('div', { class: 'settings-panel' }, [
      h('div', { class: 'settings-section-title' }, '存储管理'),
      h('div', { class: 'settings-placeholder' }, [
        h(Icon, { name: 'loader', size: 24, class: 'spin' }),
        h('span', {}, '加载中...'),
      ]),
    ]);
  }

  // 按类型分组
  const grouped = {};
  for (const f of files) {
    if (!grouped[f.type]) grouped[f.type] = [];
    grouped[f.type].push(f);
  }

  const renderFileGroups = () => {
    const types = ['prompts', 'categories', 'combinations', 'images'];
    return types.map(type => {
      const group = grouped[type];
      if (!group || group.length === 0) return null;
      return h('div', { key: type, class: 'storage-file-group' }, [
        h('div', { class: 'storage-file-group-header' }, [
          h('span', {}, TYPE_LABELS[type] || type),
          h('span', { class: 'storage-file-group-count' }, `${group.length} 个文件`),
        ]),
        ...group.map(f =>
          h('div', { key: f.name, class: 'storage-file-row' + (f.disabled ? ' disabled' : '') }, [
            h('span', { class: 'storage-file-name' }, f.name),
            h('span', { class: 'storage-file-size' }, f.sizeFormatted || formatSize(f.size)),
            f.isMain
              ? h('span', { class: 'storage-file-badge' }, '主文件')
              : h('button', {
                  class: 'storage-toggle-btn' + (f.disabled ? ' off' : ''),
                  onClick: () => handleToggle(f.name),
                  title: f.disabled ? '点击启用' : '点击禁用',
                }, h('div', { class: 'storage-toggle-knob' })),
          ]),
        ),
      ]);
    });
  };

  const renderBackups = () => {
    const list = backups.length === 0
      ? h('div', { class: 'storage-empty-hint' }, '暂无备份记录')
      : backups.map(b =>
          h('div', { key: b.name, class: 'backup-row' }, [
            h('div', { class: 'backup-info' }, [
              h('div', { class: 'backup-name' }, formatBackupName(b.name)),
              h('div', { class: 'backup-meta' }, `${b.file_count} 个文件 · ${b.sizeFormatted || formatSize(b.total_size)}`),
            ]),
            h('button', {
              class: 'backup-apply-btn',
              onClick: () => handleApplyBackup(b.name),
            }, [
              h(Icon, { name: 'refresh-cw', size: 12 }),
              ' 应用',
            ]),
          ]),
        );

    return h('div', {}, [
      h('div', { class: 'backup-actions' }, [
        h('div', { class: 'backup-max-setting' }, [
          h('span', { class: 'backup-max-label' }, '最大备份数'),
          h('input', {
            type: 'number',
            class: 'backup-max-input',
            min: 1,
            max: 20,
            value: maxBackups,
            onInput: (e) => handleMaxBackupsChange(e.target.value),
          }),
        ]),
        h('button', {
          class: 'backup-create-btn',
          onClick: handleCreateBackup,
        }, [
          h(Icon, { name: 'download', size: 12 }),
          ' 立即备份',
        ]),
      ]),
      list,
    ]);
  };

  return h('div', { class: 'settings-panel' }, [
    h('div', { class: 'settings-section-title' }, '存储文件'),
    ...renderFileGroups(),
    h('div', { class: 'settings-divider' }),
    h('div', { class: 'settings-section-title' }, '备份管理'),
    h('div', { class: 'backup-list' }, renderBackups()),
  ]);
}

// ───────── FAQ 面板 ─────────

function FAQ() {
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(-1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/prompt_gallery/faq')
      .then(r => r.json())
      .then(data => {
        if (data.success) setItems(data.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return h('div', { class: 'settings-panel' }, [
      h('div', { class: 'settings-section-title' }, '常见问题'),
      h('div', { class: 'settings-placeholder' }, [
        h(Icon, { name: 'loader', size: 24, class: 'spin' }),
      ]),
    ]);
  }

  return h('div', { class: 'settings-panel' }, [
    h('div', { class: 'settings-section-title' }, '常见问题'),
    h('div', { class: 'faq-list' },
      items.map((item, i) =>
        h('div', { key: i, class: 'faq-item' }, [
          h('div', {
            class: 'faq-question',
            onClick: () => setExpanded(expanded === i ? -1 : i),
          }, [
            h(Icon, {
              name: 'chevron-right',
              size: 14,
              class: 'faq-question-icon' + (expanded === i ? ' expanded' : ''),
            }),
            h('span', {}, item.question),
          ]),
          expanded === i &&
            h('div', { class: 'faq-answer' }, item.answer),
        ]),
      ),
    ),
  ]);
}

// ───────── 主组件 ─────────

const PANELS = {
  gallery: GallerySettings,
  storage: StorageSettings,
  faq: FAQ,
};

export function SettingsDialog({ isOpen, onClose }) {
  const [activeMenu, setActiveMenu] = useState('storage');

  const ActivePanel = PANELS[activeMenu] || StorageSettings;

  return h(
    Dialog,
    {
      isOpen,
      onClose,
      title: '设置',
      titleIcon: h(Icon, { name: 'settings', size: 18 }),
      maxWidth: '720px',
      maxHeight: '80vh',
    },
    h('div', { class: 'settings-dialog' }, [
      h('div', { class: 'settings-sidebar' },
        MENU_ITEMS.map((item) =>
          h(
            'button',
            {
              key: item.key,
              class: 'settings-menu-item' + (activeMenu === item.key ? ' active' : ''),
              onClick: () => setActiveMenu(item.key),
            },
            [
              h(Icon, { name: item.icon, size: 14 }),
              item.label,
            ],
          ),
        ),
      ),
      h('div', { class: 'settings-content' }, h(ActivePanel)),
    ]),
  );
}
