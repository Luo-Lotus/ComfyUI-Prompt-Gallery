/**
 * 添加/编辑Prompt对话框组件（使用通用Dialog重构）
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { showToast } from './Toast.js';
import { Icon } from '../lib/icons.mjs';
import { addArtist, updateArtist, updateArtistByKey, addArtistsBatch } from '../services/artistApi.js';
import { Dialog, DialogButton, DialogFormGroup, DialogFormItem } from './Dialog.js';

export function AddArtistDialog({ isOpen, mode, editModeArtist, currentCategoryId, onClose, onSave }) {
  // ============ 表单状态 ============
  const [addArtistMode, setAddArtistMode] = useState('single');
  const [promptValue, setPromptValue] = useState('');
  const [promptName, setPromptName] = useState('');
  const [promptAlias, setPromptAlias] = useState('');
  const [batchText, setBatchText] = useState('');
  const [batchDelimiter, setBatchDelimiter] = useState('+');

  // ============ 工具函数 ============

  const resetForm = () => {
    setPromptValue('');
    setPromptName('');
    setPromptAlias('');
    setBatchText('');
    setBatchDelimiter('+');
    setAddArtistMode('single');
  };

  const parseBatchText = (text, delimiter) => {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);
    const prompts = [];
    for (const line of lines) {
      const parts = line
        .split(delimiter)
        .map((s) => s.trim())
        .filter((s) => s);
      const value = parts[0] || '';
      const name = parts[1] || value;
      const alias = parts.slice(2).join(',');
      if (value) {
        prompts.push({ value, name, alias });
      }
    }
    return prompts;
  };

  const validateSingleForm = () => {
    if (!promptValue.trim()) {
      showToast('请输入Prompt值', 'warning');
      return false;
    }
    return true;
  };

  const validateBatchForm = () => {
    if (!batchText.trim()) {
      showToast('请输入Prompt列表', 'warning');
      return false;
    }
    return true;
  };

  // ============ 保存处理 ============

  const handleSingleSave = async () => {
    if (!validateSingleForm()) return;

    const artistData = {
      value: promptValue,
      name: promptName || promptValue,
      alias: promptAlias,
      categoryId: editModeArtist ? editModeArtist.categoryId : currentCategoryId || 'root',
    };

    try {
      let data;
      if (editModeArtist) {
        data = await updateArtistByKey(editModeArtist.categoryId, editModeArtist.value, artistData);
      } else {
        data = await addArtist(artistData);
      }

      if (data.success) {
        showToast(editModeArtist ? 'Prompt更新成功' : 'Prompt添加成功', 'success');
        resetForm();
        onSave();
      } else {
        showToast(data.error || '操作失败', 'error');
      }
    } catch (error) {
      showToast('操作失败: ' + error.message, 'error');
    }
  };

  const handleBatchSave = async () => {
    if (!validateBatchForm()) return;

    const promptsData = parseBatchText(batchText, batchDelimiter);

    try {
      const data = await addArtistsBatch(promptsData, currentCategoryId || 'root');

      if (data.success) {
        showToast(
          `成功添加 ${data.addedCount} 个Prompt${data.failedCount > 0 ? `，失败 ${data.failedCount} 个` : ''}`,
          data.failedCount > 0 ? 'warning' : 'success',
        );
        resetForm();
        onSave();
      } else {
        showToast(data.error || '添加失败', 'error');
      }
    } catch (error) {
      showToast('添加失败: ' + error.message, 'error');
    }
  };

  const handleSave = () => {
    if (addArtistMode === 'single') {
      handleSingleSave();
    } else {
      handleBatchSave();
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // ============ 编辑模式处理 ============
  if (editModeArtist && mode === 'edit' && !promptValue) {
    setPromptValue(editModeArtist.value);
    setPromptName(editModeArtist.name || '');
    setPromptAlias(editModeArtist.alias || '');
    setAddArtistMode('single');
  }

  // ============ 渲染函数 ============

  const renderTabs = () => {
    if (editModeArtist) return null;

    return h('div', { class: 'gallery-dialog-tabs' }, [
      h(
        'button',
        {
          class: `gallery-modal-btn ${addArtistMode === 'single' ? 'primary' : ''} gallery-dialog-tab`,
          onClick: () => setAddArtistMode('single'),
        },
        '单个添加',
      ),
      h(
        'button',
        {
          class: `gallery-modal-btn ${addArtistMode === 'batch' ? 'primary' : ''} gallery-dialog-tab`,
          onClick: () => setAddArtistMode('batch'),
        },
        '批量添加',
      ),
    ]);
  };

  const renderSingleForm = () => {
    return h(DialogFormGroup, {}, [
      h(
        DialogFormItem,
        {
          label: '值 (value)',
        },
        h('textarea', {
          value: promptValue,
          onInput: (e) => setPromptValue(e.target.value),
          placeholder: '如: 1girl, solo, long_hair',
          class: 'gallery-form-textarea',
          rows: 3,
        }),
      ),
      h(
        DialogFormItem,
        {
          label: '名称 (可选，不填则使用value)',
        },
        h('input', {
          type: 'text',
          value: promptName,
          onInput: (e) => setPromptName(e.target.value),
          placeholder: '如: 一个女孩',
          class: 'gallery-form-input',
        }),
      ),
      h(
        DialogFormItem,
        {
          label: '别名 (多个用逗号隔开)',
        },
        h('input', {
          type: 'text',
          value: promptAlias,
          onInput: (e) => setPromptAlias(e.target.value),
          placeholder: '如: one girl, solo girl',
          class: 'gallery-form-input',
        }),
      ),
    ]);
  };

  const renderBatchForm = () => {
    return [
      h(DialogFormGroup, {}, [
        h(
          DialogFormItem,
          {
            label: '分隔符',
          },
          h('input', {
            type: 'text',
            value: batchDelimiter,
            onInput: (e) => setBatchDelimiter(e.target.value),
            placeholder: '默认: +',
            class: 'gallery-form-input',
            style: { width: '80px' },
          }),
        ),
      ]),
      h(
        DialogFormItem,
        {
          label: `Prompt列表（每行格式: [值][分隔符][名称][分隔符][别名]）`,
        },
        h('textarea', {
          value: batchText,
          onInput: (e) => setBatchText(e.target.value),
          placeholder: `例如（分隔符 "${batchDelimiter || '+'}"）:\n1girl${batchDelimiter || '+'}一个女孩${batchDelimiter || '+'}one girl, solo girl\nsolo${batchDelimiter || '+'}单人`,
          rows: 8,
          class: 'gallery-form-textarea',
        }),
      ),
    ];
  };

  const renderForm = () => {
    return addArtistMode === 'single' ? renderSingleForm() : renderBatchForm();
  };

  const renderFooter = () => {
    return [
      h(
        DialogButton,
        {
          onClick: handleClose,
        },
        '取消',
      ),
      h(
        DialogButton,
        {
          variant: 'primary',
          onClick: handleSave,
        },
        editModeArtist ? '保存' : '确定',
      ),
    ];
  };

  // ============ 主渲染 ============

  return h(
    Dialog,
    {
      isOpen,
      onClose: handleClose,
      title: editModeArtist ? '编辑Prompt' : '添加Prompt',
      titleIcon: h(Icon, {
        name: editModeArtist ? 'edit' : 'plus',
        size: 18,
      }),
      maxWidth: '500px',
      footer: renderFooter(),
    },
    [renderTabs(), renderForm()],
  );
}
