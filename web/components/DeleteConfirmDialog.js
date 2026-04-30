/**
 * 删除确认对话框组件（使用通用Dialog重构）
 */
import { h } from '../lib/preact.mjs';
import { showToast } from './Toast.js';
import { deletePromptByKey } from '../services/promptApi.js';
import { Dialog, DialogButton } from './Dialog.js';
import { Icon } from '../lib/icons.mjs';

export function DeleteConfirmDialog({ isOpen, prompt, onConfirm, onCancel }) {
  /**
   * 处理删除操作
   */
  const handleDelete = async () => {
    if (!prompt) return;

    try {
      // 使用组合键删除Prompt
      const data = await deletePromptByKey(prompt.categoryId, prompt.value);

      if (data.success) {
        showToast(data.message || '删除成功', 'success');
        onConfirm();
      } else {
        showToast(data.error || '删除失败', 'error');
      }
    } catch (error) {
      showToast('删除失败: ' + error.message, 'error');
    }
  };

  /**
   * 渲染确认内容
   */
  const renderContent = () => {
    if (!prompt) return null;

    return [
      h('p', { class: 'gallery-delete-message' }, `确定要删除Prompt "${prompt.name || prompt.value}" 吗？`),
      h('p', { class: 'gallery-delete-warning' }, `这将同时删除该Prompt关联的 ${prompt.imageCount} 张图片。`),
    ];
  };

  /**
   * 渲染操作按钮
   */
  const renderFooter = () => {
    return [
      h(
        DialogButton,
        {
          onClick: onCancel,
        },
        '取消',
      ),
      h(
        DialogButton,
        {
          variant: 'danger',
          onClick: handleDelete,
        },
        '确认删除',
      ),
    ];
  };

  // ============ 主渲染 ============

  // 提前检查，避免在 Dialog 渲染时出错
  if (!isOpen || !prompt) return null;

  return h(
    Dialog,
    {
      isOpen,
      onClose: onCancel,
      title: '确认删除',
      titleIcon: h(Icon, { name: 'alert-triangle', size: 18 }),
      maxWidth: '400px',
      footer: renderFooter(),
    },
    renderContent(),
  );
}
