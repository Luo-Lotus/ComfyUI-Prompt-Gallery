/**
 * Prompt API 服务
 * 封装所有与Prompt相关的 API 调用
 */

/**
 * 添加单个Prompt
 */
export async function addPrompt(promptData) {
  const response = await fetch('/prompt_gallery/prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(promptData),
  });
  return await response.json();
}

/**
 * 更新Prompt（使用 ID，兼容旧版本）
 */
export async function updatePrompt(promptId, promptData) {
  const response = await fetch(`/prompt_gallery/prompts/${promptId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(promptData),
  });
  return await response.json();
}

/**
 * 更新Prompt（使用组合键）
 */
export async function updatePromptByKey(categoryId, value, promptData) {
  const response = await fetch(
    `/prompt_gallery/prompts/${encodeURIComponent(categoryId)}/${encodeURIComponent(value)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptData),
    },
  );
  return await response.json();
}

/**
 * 批量添加Prompt
 */
export async function addPromptsBatch(promptsData, categoryId) {
  const response = await fetch('/prompt_gallery/prompts/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompts: promptsData, categoryId }),
  });
  return await response.json();
}

/**
 * 删除Prompt（使用 ID，兼容旧版本）
 */
export async function deletePrompt(promptId) {
  const response = await fetch(`/prompt_gallery/prompts/${promptId}`, {
    method: 'DELETE',
  });
  return await response.json();
}

/**
 * 删除Prompt（使用组合键）
 */
export async function deletePromptByKey(categoryId, value) {
  const response = await fetch(
    `/prompt_gallery/prompts/${encodeURIComponent(categoryId)}/${encodeURIComponent(value)}`,
    {
      method: 'DELETE',
    },
  );
  return await response.json();
}

/**
 * 复制Prompt到其他分类
 */
export async function copyPrompt(categoryId, value, targetCategoryId, newValue) {
  const response = await fetch(
    `/prompt_gallery/prompts/${encodeURIComponent(categoryId)}/${encodeURIComponent(value)}/copy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetCategoryId,
        newValue,
      }),
    },
  );
  return await response.json();
}

/**
 * 复制图片到其他Prompt
 */
export async function copyImage(imagePath, toPromptValue) {
  const response = await fetch('/prompt_gallery/image/copy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imagePath,
      toPromptValue,
    }),
  });
  return await response.json();
}

/**
 * 保存循环状态
 */
export async function saveCycleState(nodeId, cycleIndex) {
  const response = await fetch('/prompt_gallery/cycle-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      node_id: nodeId,
      cycle_index: cycleIndex,
    }),
  });
  return await response.json();
}

/**
 * 获取循环状态
 */
export async function getCycleState(nodeId) {
  const response = await fetch(`/prompt_gallery/cycle-state?node_id=${encodeURIComponent(nodeId)}`);
  return await response.json();
}

/**
 * 重置循环状态
 */
export async function resetCycleState(nodeId) {
  const response = await fetch('/prompt_gallery/cycle-state/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      node_id: nodeId,
    }),
  });
  return await response.json();
}

/**
 * 导出Prompt（含图片）为 ZIP 文件
 */
export async function exportPrompts(prompts, options = {}) {
  const response = await fetch('/prompt_gallery/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompts,
      includeImages: options.includeImages !== false,
      maxImagesPerPrompt: options.maxImagesPerPrompt || 0,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '导出失败' }));
    throw new Error(err.error || '导出失败');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prompts_export.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 导出分类（递归含子分类、Prompt、组合）为 ZIP 文件
 */
export async function exportCategory(categoryId, options = {}) {
  const response = await fetch('/prompt_gallery/export-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      categoryId,
      includeImages: options.includeImages !== false,
      maxImagesPerPrompt: options.maxImagesPerPrompt || 0,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '导出失败' }));
    throw new Error(err.error || '导出失败');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'category_export.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 导入（从 ZIP 文件，支持 v1 Prompt格式和 v2 分类格式）
 */
export async function importPrompts(file, categoryId, separateStorage = false) {
  const formData = new FormData();
  formData.append('file', file);
  const params = new URLSearchParams({ categoryId });
  if (separateStorage) params.set('separate', 'true');
  const response = await fetch(`/prompt_gallery/import?${params}`, {
    method: 'POST',
    body: formData,
  });
  return await response.json();
}
