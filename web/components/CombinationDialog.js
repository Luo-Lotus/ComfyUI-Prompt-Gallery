/**
 * 组合对话框组件
 * 用于创建和编辑组合
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useMemo, useCallback } from '../lib/hooks.mjs';
import { Dialog, DialogButton, DialogFormGroup, DialogFormItem } from './Dialog.js';
import { FlatSelector } from './FlatSelector.js';
import { showToast } from './Toast.js';
import { createCombination, updateCombination, searchAll } from '../utils.js';
import { Icon } from '../lib/icons.mjs';

export function CombinationDialog({
  isOpen,
  mode = 'add',
  combination = null,
  currentCategoryId = 'root',
  onClose,
  onSave,
}) {
  const [name, setName] = useState('');
  const [selectedPromptNames, setSelectedPromptNames] = useState(new Set());
  const [outputContent, setOutputContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // 编辑模式时填充数据
  useEffect(() => {
    if (isOpen && mode === 'edit' && combination) {
      setName(combination.name || '');
      setSelectedPromptNames(new Set(combination.prompts || []));
      setOutputContent(combination.outputContent || '');
    } else if (isOpen && mode === 'add') {
      setName('');
      setSelectedPromptNames(new Set());
      setOutputContent('');
    }
  }, [isOpen, mode, combination]);

  // 自动生成的输出内容预览
  const autoOutput = useMemo(() => {
    return Array.from(selectedPromptNames).join(',');
  }, [selectedPromptNames]);

  const togglePrompt = (key, prompt) => {
    const promptName = prompt.value;
    setSelectedPromptNames((prev) => {
      const next = new Set(prev);
      if (next.has(promptName)) {
        next.delete(promptName);
      } else {
        next.add(promptName);
      }
      return next;
    });
  };

  const handleSearch = useCallback(async (query) => {
    if (!query || query.length < 1) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const result = await searchAll(query, 50);
      setSearchResults(result.prompts || []);
    } catch (err) {
      console.error('搜索失败:', err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast('请输入组合名称', 'warning');
      return;
    }
    if (selectedPromptNames.size === 0) {
      showToast('请至少选择一个Prompt', 'warning');
      return;
    }

    const prompts = Array.from(selectedPromptNames);
    const content = outputContent.trim() || autoOutput;

    setSaving(true);
    try {
      if (mode === 'add') {
        await createCombination({
          name: name.trim(),
          categoryId: currentCategoryId,
          prompts,
          outputContent: content,
        });
        showToast('组合创建成功', 'success');
      } else {
        await updateCombination(combination.id, {
          name: name.trim(),
          prompts,
          outputContent: content,
        });
        showToast('组合更新成功', 'success');
      }
      onSave && onSave();
    } catch (err) {
      showToast('操作失败: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return h(
    Dialog,
    {
      isOpen,
      onClose,
      title: mode === 'add' ? '新建组合' : '编辑组合',
      titleIcon: h(Icon, { name: 'link', size: 18 }),
      maxWidth: '500px',
      footer: [
        h(DialogButton, { onClick: onClose }, '取消'),
        h(
          DialogButton,
          {
            variant: 'primary',
            onClick: handleSubmit,
            disabled: saving,
          },
          saving ? '保存中...' : mode === 'add' ? '创建' : '保存',
        ),
      ],
    },
    h(DialogFormGroup, {}, [
      // 组合名称
      h(
        DialogFormItem,
        { label: '组合名称' },
        h('input', {
          type: 'text',
          class: 'gallery-form-input',
          value: name,
          onInput: (e) => setName(e.target.value),
          placeholder: '输入组合名称',
        }),
      ),

      // 选择Prompt（使用 FlatSelector 搜索模式）
      h(
        DialogFormItem,
        { label: `选择Prompt (${selectedPromptNames.size})` },
        h(FlatSelector, {
          type: 'prompt',
          prompts: searchResults,
          multiSelect: true,
          selectedIds: selectedPromptNames,
          onToggleItem: togglePrompt,
          placeholder: '搜索Prompt...',
          searchMode: true,
          onSearch: handleSearch,
          searchLoading,
        }),
      ),

      // 输出内容
      h(
        DialogFormItem,
        { label: '输出内容' },
        h('input', {
          type: 'text',
          class: 'gallery-form-input',
          value: outputContent,
          onInput: (e) => setOutputContent(e.target.value),
          placeholder: autoOutput || '逗号连接的Prompt名称',
        }),
      ),
      h('div', { class: 'gallery-form-hint' }, `预览: ${outputContent.trim() || autoOutput || '(未选择Prompt)'}`),
    ]),
  );
}
